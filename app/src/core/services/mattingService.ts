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

function mergeBorderTrim(autoTrim: BorderTrim | null, manualX: number, manualY: number, width: number, height: number): BorderTrim | null {
  const safeX = clamp(Math.floor(manualX), 0, Math.floor(width / 2))
  const safeY = clamp(Math.floor(manualY), 0, Math.floor(height / 2))
  const merged: BorderTrim = {
    top: Math.max(autoTrim?.top ?? 0, safeY),
    right: Math.max(autoTrim?.right ?? 0, safeX),
    bottom: Math.max(autoTrim?.bottom ?? 0, safeY),
    left: Math.max(autoTrim?.left ?? 0, safeX),
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

function rowTransparentRatio(data: Uint8ClampedArray, width: number, row: number, alphaThreshold: number) {
  let transparent = 0
  for (let x = 0; x < width; x += 1) {
    const idx = (row * width + x) * 4
    if (data[idx + 3] <= alphaThreshold) transparent += 1
  }
  return transparent / width
}

function colTransparentRatio(data: Uint8ClampedArray, width: number, height: number, col: number, alphaThreshold: number) {
  let transparent = 0
  for (let y = 0; y < height; y += 1) {
    const idx = (y * width + col) * 4
    if (data[idx + 3] <= alphaThreshold) transparent += 1
  }
  return transparent / height
}

function isBorderRowLike(data: Uint8ClampedArray, width: number, row: number, ref: { r: number; g: number; b: number }) {
  let similar = 0
  const tolerance = 20
  for (let x = 0; x < width; x += 1) {
    const idx = (row * width + x) * 4
    const dist = colorDistance(data[idx], data[idx + 1], data[idx + 2], ref.r, ref.g, ref.b)
    if (dist <= tolerance) similar += 1
  }
  const similarRatio = similar / width
  const avgAlpha = averageRowAlpha(data, width, row)
  const transparentRatio = rowTransparentRatio(data, width, row, 36)
  return transparentRatio >= 0.92 || (similarRatio >= 0.9 && avgAlpha <= 84)
}

function isBorderColLike(data: Uint8ClampedArray, width: number, height: number, col: number, ref: { r: number; g: number; b: number }) {
  let similar = 0
  const tolerance = 20
  for (let y = 0; y < height; y += 1) {
    const idx = (y * width + col) * 4
    const dist = colorDistance(data[idx], data[idx + 1], data[idx + 2], ref.r, ref.g, ref.b)
    if (dist <= tolerance) similar += 1
  }
  const similarRatio = similar / height
  const avgAlpha = averageColAlpha(data, width, height, col)
  const transparentRatio = colTransparentRatio(data, width, height, col, 36)
  return transparentRatio >= 0.92 || (similarRatio >= 0.9 && avgAlpha <= 84)
}

function detectOuterBorderTrim(data: Uint8ClampedArray, width: number, height: number): BorderTrim {
  const maxScan = Math.max(1, Math.min(24, Math.floor(Math.min(width, height) * 0.08)))
  const topRef = averageRowColor(data, width, 0)
  const bottomRef = averageRowColor(data, width, height - 1)
  const leftRef = averageColColor(data, width, height, 0)
  const rightRef = averageColColor(data, width, height, width - 1)

  let top = 0
  let bottom = 0
  let left = 0
  let right = 0

  for (let i = 0; i < maxScan; i += 1) {
    if (isBorderRowLike(data, width, i, topRef)) top += 1
    else break
  }

  for (let i = 0; i < maxScan; i += 1) {
    const row = height - 1 - i
    if (row < top) break
    if (isBorderRowLike(data, width, row, bottomRef)) bottom += 1
    else break
  }

  for (let i = 0; i < maxScan; i += 1) {
    if (isBorderColLike(data, width, height, i, leftRef)) left += 1
    else break
  }

  for (let i = 0; i < maxScan; i += 1) {
    const col = width - 1 - i
    if (col < left) break
    if (isBorderColLike(data, width, height, col, rightRef)) right += 1
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

export async function runMatting(asset: ImageAsset, config: MattingConfig): Promise<MattingResult> {
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
  const pixels = frame.data

  let alpha = new Uint8ClampedArray(frame.data.length / 4)
  let warning: string | undefined

  if (config.algorithm === 'chroma_key') {
    alpha = runChromaKey(pixels, config)
  } else if (config.algorithm === 'checkerboard') {
    alpha = runCheckerboard(pixels, config)
  } else {
    const onnx = await ensureOnnxRuntime(config.modelPath)
    alpha = runAiFallback(pixels, config)
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

  const autoBorderTrim = config.removeOuterBorder ? detectOuterBorderTrim(pixels, canvas.width, canvas.height) : null
  const borderTrim = mergeBorderTrim(autoBorderTrim, config.trimBorderX, config.trimBorderY, canvas.width, canvas.height)

  if (borderTrim) {
    const removed = borderTrim.top + borderTrim.right + borderTrim.bottom + borderTrim.left
    if (removed > 0) {
      for (let i = 0; i < pixels.length; i += 4) {
        const idx = i / 4
        const x = idx % canvas.width
        const y = Math.floor(idx / canvas.width)
        if (inTrimBorder(x, y, canvas.width, canvas.height, borderTrim)) {
          pixels[i + 3] = 0
        }
      }

      const trimHint = `边框处理：上${borderTrim.top} 右${borderTrim.right} 下${borderTrim.bottom} 左${borderTrim.left}`
      warning = warning ? `${warning}；${trimHint}` : trimHint
    }
  }

  ctx.putImageData(frame, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) {
    throw new Error('PNG_EXPORT_FAILED')
  }

  const outputUrl = URL.createObjectURL(blob)
  return {
    assetId: asset.id,
    outputUrl,
    algorithm: config.algorithm,
    warning,
  }
}
