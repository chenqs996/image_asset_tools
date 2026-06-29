import type { ImageAsset } from '../../types/image'
import type { MattingConfig, MattingResult } from '../../types/matting'
import { ensureOnnxRuntime } from './onnxRuntimeService'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const fallback = { r: 255, g: 255, b: 255 }
  if (![3, 6].includes(clean.length)) return fallback

  const normalized = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = Number.parseInt(normalized, 16)
  if (Number.isNaN(num)) return fallback
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

function blurAlpha(alpha: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius <= 0) return alpha
  const out = new Uint8ClampedArray(alpha)
  const r = Math.min(3, Math.floor(radius))

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0
      let count = 0
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          sum += alpha[ny * width + nx]
          count += 1
        }
      }
      out[y * width + x] = Math.floor(sum / Math.max(1, count))
    }
  }

  return out
}

interface BorderTrim {
  top: number
  right: number
  bottom: number
  left: number
}

function mergeBorderTrim(
  autoTrim: BorderTrim | null,
  manualTop: number,
  manualRight: number,
  manualBottom: number,
  manualLeft: number,
  width: number,
  height: number,
): BorderTrim | null {
  const safeTop = clamp(Math.floor(manualTop), 0, Math.floor(height / 2))
  const safeRight = clamp(Math.floor(manualRight), 0, Math.floor(width / 2))
  const safeBottom = clamp(Math.floor(manualBottom), 0, Math.floor(height / 2))
  const safeLeft = clamp(Math.floor(manualLeft), 0, Math.floor(width / 2))
  const merged: BorderTrim = {
    top: Math.max(autoTrim?.top ?? 0, safeTop),
    right: Math.max(autoTrim?.right ?? 0, safeRight),
    bottom: Math.max(autoTrim?.bottom ?? 0, safeBottom),
    left: Math.max(autoTrim?.left ?? 0, safeLeft),
  }
  return merged.top || merged.right || merged.bottom || merged.left ? merged : null
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function averageRowColor(data: Uint8ClampedArray, width: number, row: number) {
  let r = 0
  let g = 0
  let b = 0
  for (let x = 0; x < width; x += 1) {
    const idx = (row * width + x) * 4
    r += data[idx]
    g += data[idx + 1]
    b += data[idx + 2]
  }
  return {
    r: r / width,
    g: g / width,
    b: b / width,
  }
}

function averageRowAlpha(data: Uint8ClampedArray, width: number, row: number) {
  let alpha = 0
  for (let x = 0; x < width; x += 1) {
    const idx = (row * width + x) * 4
    alpha += data[idx + 3]
  }
  return alpha / width
}

function averageColColor(data: Uint8ClampedArray, width: number, height: number, col: number) {
  let r = 0
  let g = 0
  let b = 0
  for (let y = 0; y < height; y += 1) {
    const idx = (y * width + col) * 4
    r += data[idx]
    g += data[idx + 1]
    b += data[idx + 2]
  }
  return {
    r: r / height,
    g: g / height,
    b: b / height,
  }
}

function averageColAlpha(data: Uint8ClampedArray, width: number, height: number, col: number) {
  let alpha = 0
  for (let y = 0; y < height; y += 1) {
    const idx = (y * width + col) * 4
    alpha += data[idx + 3]
  }
  return alpha / height
}

function rowCoverageRatio(data: Uint8ClampedArray, width: number, row: number, alphaThreshold: number) {
  let covered = 0
  for (let x = 0; x < width; x += 1) {
    const idx = (row * width + x) * 4
    if (data[idx + 3] > alphaThreshold) covered += 1
  }
  return covered / width
}

function colCoverageRatio(data: Uint8ClampedArray, width: number, height: number, col: number, alphaThreshold: number) {
  let covered = 0
  for (let y = 0; y < height; y += 1) {
    const idx = (y * width + col) * 4
    if (data[idx + 3] > alphaThreshold) covered += 1
  }
  return covered / height
}

function rowUniformity(data: Uint8ClampedArray, width: number, row: number, ref: { r: number; g: number; b: number }) {
  let similar = 0
  const tolerance = 24
  for (let x = 0; x < width; x += 1) {
    const idx = (row * width + x) * 4
    const dist = colorDistance(data[idx], data[idx + 1], data[idx + 2], ref.r, ref.g, ref.b)
    if (dist <= tolerance) similar += 1
  }
  return similar / width
}

function colUniformity(data: Uint8ClampedArray, width: number, height: number, col: number, ref: { r: number; g: number; b: number }) {
  let similar = 0
  const tolerance = 24
  for (let y = 0; y < height; y += 1) {
    const idx = (y * width + col) * 4
    const dist = colorDistance(data[idx], data[idx + 1], data[idx + 2], ref.r, ref.g, ref.b)
    if (dist <= tolerance) similar += 1
  }
  return similar / height
}

function isBorderRowLike(data: Uint8ClampedArray, width: number, row: number, innerRow: number) {
  const rowColor = averageRowColor(data, width, row)
  const innerColor = averageRowColor(data, width, innerRow)
  const uniformity = rowUniformity(data, width, row, rowColor)
  const colorContrast = colorDistance(rowColor.r, rowColor.g, rowColor.b, innerColor.r, innerColor.g, innerColor.b)
  const alphaContrast = Math.abs(averageRowAlpha(data, width, row) - averageRowAlpha(data, width, innerRow))
  const coverageRatio = rowCoverageRatio(data, width, row, 24)

  const hasEdgeChange = colorContrast >= 16 || alphaContrast >= 20
  const isLikelyLine = uniformity >= 0.88 && hasEdgeChange
  return isLikelyLine && coverageRatio >= 0.26
}

function isBorderColLike(data: Uint8ClampedArray, width: number, height: number, col: number, innerCol: number) {
  const colColor = averageColColor(data, width, height, col)
  const innerColor = averageColColor(data, width, height, innerCol)
  const uniformity = colUniformity(data, width, height, col, colColor)
  const colorContrast = colorDistance(colColor.r, colColor.g, colColor.b, innerColor.r, innerColor.g, innerColor.b)
  const alphaContrast = Math.abs(averageColAlpha(data, width, height, col) - averageColAlpha(data, width, height, innerCol))
  const coverageRatio = colCoverageRatio(data, width, height, col, 24)

  const hasEdgeChange = colorContrast >= 16 || alphaContrast >= 20
  const isLikelyLine = uniformity >= 0.88 && hasEdgeChange
  return isLikelyLine && coverageRatio >= 0.26
}

function detectOuterBorderTrim(data: Uint8ClampedArray, width: number, height: number): BorderTrim {
  const maxScan = Math.max(1, Math.min(24, Math.floor(Math.min(width, height) * 0.08)))

  let top = 0
  let bottom = 0
  let left = 0
  let right = 0

  for (let i = 0; i < maxScan; i += 1) {
    if (i + 1 >= height) break
    if (isBorderRowLike(data, width, i, i + 1)) top += 1
    else break
  }

  for (let i = 0; i < maxScan; i += 1) {
    const row = height - 1 - i
    if (row < top) break
    if (row - 1 < 0) break
    if (isBorderRowLike(data, width, row, row - 1)) bottom += 1
    else break
  }

  for (let i = 0; i < maxScan; i += 1) {
    if (i + 1 >= width) break
    if (isBorderColLike(data, width, height, i, i + 1)) left += 1
    else break
  }

  for (let i = 0; i < maxScan; i += 1) {
    const col = width - 1 - i
    if (col < left) break
    if (col - 1 < 0) break
    if (isBorderColLike(data, width, height, col, col - 1)) right += 1
    else break
  }

  return { top, right, bottom, left }
}

function inTrimBorder(x: number, y: number, width: number, height: number, trim: BorderTrim) {
  if (trim.top > 0 && y < trim.top) return true
  if (trim.bottom > 0 && y >= height - trim.bottom) return true
  if (trim.left > 0 && x < trim.left) return true
  if (trim.right > 0 && x >= width - trim.right) return true
  return false
}

async function loadImageFrame(asset: ImageAsset) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
    img.src = asset.objectUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('CANVAS_CONTEXT_FAILED')
  }

  ctx.drawImage(image, 0, 0)
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { canvas, ctx, frame, pixels: frame.data }
}

function finalizeMattingOutput(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, frame: ImageData, warning?: string) {
  ctx.putImageData(frame, 0, 0)
  return new Promise<MattingResult>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('PNG_EXPORT_FAILED'))
        return
      }
      resolve({
        assetId: '',
        outputUrl: URL.createObjectURL(blob),
        algorithm: 'ai_general',
        warning,
      })
    }, 'image/png')
  })
}

function applyBorderTrimToFrame(pixels: Uint8ClampedArray, width: number, height: number, config: MattingConfig) {
  const borderTrim = config.removeOuterBorder
    ? detectOuterBorderTrim(pixels, width, height)
    : mergeBorderTrim(
        null,
        config.trimBorderTop,
        config.trimBorderRight,
        config.trimBorderBottom,
        config.trimBorderLeft,
        width,
        height,
      )

  let warning: string | undefined
  if (borderTrim) {
    const removed = borderTrim.top + borderTrim.right + borderTrim.bottom + borderTrim.left
    if (removed > 0) {
      for (let i = 0; i < pixels.length; i += 4) {
        const idx = i / 4
        const x = idx % width
        const y = Math.floor(idx / width)
        if (inTrimBorder(x, y, width, height, borderTrim)) {
          pixels[i + 3] = 0
        }
      }

      warning = `边框处理：上${borderTrim.top} 右${borderTrim.right} 下${borderTrim.bottom} 左${borderTrim.left}`
    }
  }

  return warning
}

async function processBackgroundStage(asset: ImageAsset, config: MattingConfig): Promise<MattingResult> {
  const { canvas, ctx, frame, pixels } = await loadImageFrame(asset)

  let alpha = new Uint8ClampedArray(frame.data.length / 4)
  let warning: string | undefined
  let usedAiFallback = false

  if (config.algorithm === 'chroma_key') {
    alpha = runChromaKey(pixels, config)
  } else if (config.algorithm === 'checkerboard') {
    alpha = runCheckerboard(pixels, config)
  } else {
    const onnx = await ensureOnnxRuntime(config.modelPath)
    alpha = runAiFallback(pixels, config)
    usedAiFallback = true
    if (!onnx.ready) {
      warning = `ONNX Runtime未加载模型，已使用AI回退算法：${onnx.error}`
    }
  }

  const smoothed = blurAlpha(alpha, canvas.width, canvas.height, config.smooth + config.feather)
  const edgeBoost = config.edgePreference === 'clean_edge' ? -20 : 10

  for (let i = 0; i < pixels.length; i += 4) {
    const idx = i / 4
    pixels[i + 3] = clamp(smoothed[idx] + edgeBoost, 0, 255)
  }

  if (usedAiFallback) {
    suppressFallbackHalo(pixels, canvas.width, canvas.height, config.edgePreference)
  }

  const result = await finalizeMattingOutput(canvas, ctx, frame, warning)
  return {
    ...result,
    assetId: asset.id,
    algorithm: config.algorithm,
  }
}

async function processBorderStage(asset: ImageAsset, config: MattingConfig): Promise<MattingResult> {
  const { canvas, ctx, frame, pixels } = await loadImageFrame(asset)
  const warning = applyBorderTrimToFrame(pixels, canvas.width, canvas.height, config)
  const result = await finalizeMattingOutput(canvas, ctx, frame, warning)
  return {
    ...result,
    assetId: asset.id,
    algorithm: config.algorithm,
  }
}

function runChromaKey(data: Uint8ClampedArray, config: MattingConfig) {
  const { r: br, g: bg, b: bb } = hexToRgb(config.bgColorHex)
  const alpha = new Uint8ClampedArray(data.length / 4)
  const threshold = clamp(config.threshold, 0, 120)

  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - br
    const dg = data[i + 1] - bg
    const db = data[i + 2] - bb
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)
    const base = dist <= threshold ? 0 : 255
    alpha[i / 4] = base
  }

  return alpha
}

function runCheckerboard(data: Uint8ClampedArray, config: MattingConfig) {
  const alpha = new Uint8ClampedArray(data.length / 4)
  const grayTolerance = clamp(config.threshold, 8, 80)
  const saturationLimit = clamp(config.denoise, 6, 64)

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max - min
    const lum = (r + g + b) / 3

    const nearGray = sat < saturationLimit
    const checkerLumBand = lum >= 115 - grayTolerance && lum <= 230
    alpha[i / 4] = nearGray && checkerLumBand ? 0 : 255
  }

  return alpha
}

function runAiFallback(data: Uint8ClampedArray, config: MattingConfig) {
  const alpha = new Uint8ClampedArray(data.length / 4)
  const t = clamp(config.threshold, 0, 100)

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    alpha[i / 4] = luma > 240 - t ? 0 : 255
  }

  return alpha
}

function suppressFallbackHalo(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  edgePreference: MattingConfig['edgePreference'],
) {
  const alphaCopy = new Uint8ClampedArray(width * height)
  for (let i = 0; i < alphaCopy.length; i += 1) {
    alphaCopy[i] = pixels[i * 4 + 3]
  }

  const aggressive = edgePreference === 'clean_edge'
  const lowCut = aggressive ? 56 : 40
  const midCut = aggressive ? 152 : 132
  const strongOpaque = 200

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x
      const px = idx * 4
      const a = alphaCopy[idx]

      if (a <= lowCut) {
        pixels[px + 3] = 0
        continue
      }

      if (a < midCut) {
        let support = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const na = alphaCopy[ny * width + nx]
            if (na >= strongOpaque) support += 1
          }
        }

        if (support <= (aggressive ? 2 : 1)) {
          pixels[px + 3] = 0
          continue
        }

        if (support <= (aggressive ? 4 : 3)) {
          pixels[px + 3] = Math.min(a, aggressive ? 96 : 112)
        }
      }

      const outA = pixels[px + 3]
      if (outA > 0 && outA < 120) {
        const factor = clamp(outA / 120, 0.45, 1)
        pixels[px] = Math.round(pixels[px] * factor)
        pixels[px + 1] = Math.round(pixels[px + 1] * factor)
        pixels[px + 2] = Math.round(pixels[px + 2] * factor)
      }
    }
  }
}

export async function runMatting(asset: ImageAsset, config: MattingConfig): Promise<MattingResult> {
  const background = await processBackgroundStage(asset, config)
  try {
    return await processBorderStage({ ...asset, objectUrl: background.outputUrl }, config)
  } finally {
    URL.revokeObjectURL(background.outputUrl)
  }
}

export async function runMattingBackground(asset: ImageAsset, config: MattingConfig): Promise<MattingResult> {
  return processBackgroundStage(asset, config)
}

export async function runMattingBorder(asset: ImageAsset, config: MattingConfig): Promise<MattingResult> {
  return processBorderStage(asset, config)
}
