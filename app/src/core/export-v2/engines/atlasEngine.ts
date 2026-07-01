import type { ExportExecutionResult, ExportTaskSpec } from '../types'
import { canvasToPngBlob, loadAssetImage, sanitizeFileName, toJsonBlob } from './common'

interface PackedFrame {
  assetId: string
  name: string
  page: number
  x: number
  y: number
  w: number
  h: number
  sourceW: number
  sourceH: number
  trimmed: boolean
  offsetX: number
  offsetY: number
  rotated: boolean
}

interface TrimRect {
  x: number
  y: number
  w: number
  h: number
}

interface FrameSource {
  asset: ExportTaskSpec['assets'][number]
  name: string
  sourceW: number
  sourceH: number
  trimRect: TrimRect
  trimmedCanvas: HTMLCanvasElement
  rotatedCanvas: HTMLCanvasElement
}

interface OrientationChoice {
  rotated: boolean
  canvas: HTMLCanvasElement
  frameW: number
  frameH: number
  slotW: number
  slotH: number
}

function nextPow2(value: number) {
  let v = 1
  while (v < value) v <<= 1
  return v
}

function clampAtlasSize(value: number) {
  return Math.min(8192, Math.max(256, Math.floor(value)))
}

function estimateAtlasSize(entries: FrameSource[], padding: number, extrude: number, powerOfTwo: boolean) {
  const slotArea = entries.reduce(
    (sum, item) => sum + (item.trimRect.w + padding * 2 + extrude * 2) * (item.trimRect.h + padding * 2 + extrude * 2),
    0,
  )
  const maxSide = Math.max(
    ...entries.map((item) => Math.max(item.trimRect.w + padding * 2 + extrude * 2, item.trimRect.h + padding * 2 + extrude * 2)),
    256,
  )
  const estimated = clampAtlasSize(Math.ceil(Math.max(Math.sqrt(slotArea * 1.1), maxSide)))
  if (powerOfTwo) return clampAtlasSize(nextPow2(estimated))
  return clampAtlasSize(Math.ceil(estimated / 64) * 64)
}

function detectTrimRect(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ATLAS_TRIM_CONTEXT_FAILED')
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha > 0) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, w: width, h: height }
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  }
}

function createTrimmedCanvas(image: HTMLImageElement, trimRect: TrimRect) {
  const canvas = document.createElement('canvas')
  canvas.width = trimRect.w
  canvas.height = trimRect.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ATLAS_TRIMMED_CANVAS_CONTEXT_FAILED')
  ctx.drawImage(image, trimRect.x, trimRect.y, trimRect.w, trimRect.h, 0, 0, trimRect.w, trimRect.h)
  return canvas
}

function createRotatedCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas')
  canvas.width = source.height
  canvas.height = source.width
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ATLAS_ROTATE_CANVAS_CONTEXT_FAILED')
  ctx.translate(canvas.width, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(source, 0, 0)
  return canvas
}

function drawWithExtrude(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  extrude: number,
) {
  ctx.drawImage(source, x, y, w, h)
  if (extrude <= 0) return

  ctx.drawImage(source, 0, 0, w, 1, x, y - extrude, w, extrude)
  ctx.drawImage(source, 0, h - 1, w, 1, x, y + h, w, extrude)
  ctx.drawImage(source, 0, 0, 1, h, x - extrude, y, extrude, h)
  ctx.drawImage(source, w - 1, 0, 1, h, x + w, y, extrude, h)

  ctx.drawImage(source, 0, 0, 1, 1, x - extrude, y - extrude, extrude, extrude)
  ctx.drawImage(source, w - 1, 0, 1, 1, x + w, y - extrude, extrude, extrude)
  ctx.drawImage(source, 0, h - 1, 1, 1, x - extrude, y + h, extrude, extrude)
  ctx.drawImage(source, w - 1, h - 1, 1, 1, x + w, y + h, extrude, extrude)
}

function sortByPolicy(entries: FrameSource[], policy: 'balanced' | 'min_pages' | 'min_waste') {
  const sorted = [...entries]
  sorted.sort((a, b) => {
    const areaDiff = b.trimRect.w * b.trimRect.h - a.trimRect.w * a.trimRect.h
    const maxSideDiff = Math.max(b.trimRect.w, b.trimRect.h) - Math.max(a.trimRect.w, a.trimRect.h)
    const heightDiff = b.trimRect.h - a.trimRect.h
    const widthDiff = b.trimRect.w - a.trimRect.w
    if (policy === 'min_pages') {
      return maxSideDiff || areaDiff || heightDiff || a.name.localeCompare(b.name)
    }
    if (policy === 'min_waste') {
      return areaDiff || maxSideDiff || heightDiff || widthDiff || a.name.localeCompare(b.name)
    }
    return heightDiff || widthDiff || areaDiff || a.name.localeCompare(b.name)
  })
  return sorted
}

function chooseOrientation(
  item: FrameSource,
  atlasSize: number,
  cursorX: number,
  cursorY: number,
  rowHeight: number,
  padding: number,
  extrude: number,
  allowRotate: boolean,
  policy: 'balanced' | 'min_pages' | 'min_waste',
) {
  const candidates: OrientationChoice[] = [
    {
      rotated: false,
      canvas: item.trimmedCanvas,
      frameW: item.trimRect.w,
      frameH: item.trimRect.h,
      slotW: item.trimRect.w + padding * 2 + extrude * 2,
      slotH: item.trimRect.h + padding * 2 + extrude * 2,
    },
  ]

  if (allowRotate && item.trimRect.w !== item.trimRect.h) {
    candidates.push({
      rotated: true,
      canvas: item.rotatedCanvas,
      frameW: item.trimRect.h,
      frameH: item.trimRect.w,
      slotW: item.trimRect.h + padding * 2 + extrude * 2,
      slotH: item.trimRect.w + padding * 2 + extrude * 2,
    })
  }

  const valid = candidates.filter((candidate) => {
    if (cursorX + candidate.slotW > atlasSize) return false
    if (cursorY + candidate.slotH > atlasSize) return false
    return true
  })
  if (valid.length === 0) return null

  const score = (candidate: OrientationChoice) => {
    const newRowHeight = Math.max(rowHeight, candidate.slotH)
    const rowGrowth = newRowHeight - rowHeight
    const remainingW = atlasSize - (cursorX + candidate.slotW)
    const localWaste = rowHeight > 0 ? (newRowHeight - candidate.slotH) * candidate.slotW : 0

    if (policy === 'min_pages') {
      return rowGrowth * 100000 + remainingW * 10 + (candidate.rotated ? 1 : 0)
    }
    if (policy === 'min_waste') {
      return localWaste * 1000 + remainingW * 10 + rowGrowth + (candidate.rotated ? 1 : 0)
    }
    return rowGrowth * 10000 + remainingW * 10 + localWaste + (candidate.rotated ? 1 : 0)
  }

  valid.sort((a, b) => score(a) - score(b))
  return valid[0]
}

export async function runAtlasExport(task: ExportTaskSpec): Promise<ExportExecutionResult> {
  const config = task.payload.template === 'atlas' ? task.payload.config : null
  if (!config) throw new Error('ATLAS_CONFIG_MISSING')

  const warnings: string[] = []
  const padding = Math.max(0, config.padding)
  const extrude = Math.max(0, config.extrude)
  const imageEntries = await Promise.all(task.assets.map(async (asset) => ({ asset, image: await loadAssetImage(asset) })))
  const frameSources: FrameSource[] = imageEntries.map(({ asset, image }) => {
    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = image.naturalWidth
    sourceCanvas.height = image.naturalHeight
    const sourceCtx = sourceCanvas.getContext('2d')
    if (!sourceCtx) throw new Error('ATLAS_SOURCE_CONTEXT_FAILED')
    sourceCtx.drawImage(image, 0, 0)

    const trimRect = detectTrimRect(sourceCanvas)
    const trimmedCanvas = createTrimmedCanvas(image, trimRect)
    const rotatedCanvas = createRotatedCanvas(trimmedCanvas)
    return {
      asset,
      name: sanitizeFileName(asset.name),
      sourceW: asset.width,
      sourceH: asset.height,
      trimRect,
      trimmedCanvas,
      rotatedCanvas,
    }
  })

  const orderedFrames = sortByPolicy(frameSources, config.policy)
  const atlasSize = config.autoSize
    ? estimateAtlasSize(orderedFrames, padding, extrude, config.powerOfTwo)
    : config.powerOfTwo
      ? clampAtlasSize(nextPow2(Math.max(256, config.maxSize)))
      : clampAtlasSize(config.maxSize)

  const pages: Array<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; used: boolean }> = []
  const frames: PackedFrame[] = []

  const createPage = () => {
    const canvas = document.createElement('canvas')
    canvas.width = atlasSize
    canvas.height = atlasSize
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('ATLAS_CONTEXT_FAILED')
    pages.push({ canvas, ctx, used: false })
  }

  createPage()

  let pageIndex = 0
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  let packedArea = 0
  const failedAssets: string[] = []

  for (const item of orderedFrames) {
    const normalSlotW = item.trimRect.w + padding * 2 + extrude * 2
    const normalSlotH = item.trimRect.h + padding * 2 + extrude * 2
    const rotatedSlotW = item.trimRect.h + padding * 2 + extrude * 2
    const rotatedSlotH = item.trimRect.w + padding * 2 + extrude * 2
    const minRequiredW = config.allowRotate ? Math.min(normalSlotW, rotatedSlotW) : normalSlotW
    const minRequiredH = config.allowRotate ? Math.min(normalSlotH, rotatedSlotH) : normalSlotH

    if (minRequiredW > atlasSize || minRequiredH > atlasSize) {
      warnings.push(`素材过大已跳过：${item.asset.name}（需求槽位至少 ${minRequiredW}x${minRequiredH} > 图集 ${atlasSize}）`)
      failedAssets.push(item.asset.id)
      continue
    }

    let choice = chooseOrientation(
      item,
      atlasSize,
      cursorX,
      cursorY,
      rowHeight,
      padding,
      extrude,
      config.allowRotate,
      config.policy,
    )

    if (!choice) {
      cursorX = 0
      cursorY += rowHeight
      rowHeight = 0
      choice = chooseOrientation(
        item,
        atlasSize,
        cursorX,
        cursorY,
        rowHeight,
        padding,
        extrude,
        config.allowRotate,
        config.policy,
      )
    }

    if (!choice) {
      pageIndex += 1
      if (!pages[pageIndex]) createPage()
      cursorX = 0
      cursorY = 0
      rowHeight = 0
      choice = chooseOrientation(
        item,
        atlasSize,
        cursorX,
        cursorY,
        rowHeight,
        padding,
        extrude,
        config.allowRotate,
        config.policy,
      )
    }

    if (!choice) {
      warnings.push(`素材放置失败已跳过：${item.asset.name}`)
      failedAssets.push(item.asset.id)
      continue
    }

    const page = pages[pageIndex]
    const drawX = cursorX + padding + extrude
    const drawY = cursorY + padding + extrude
    drawWithExtrude(page.ctx, choice.canvas, drawX, drawY, choice.frameW, choice.frameH, extrude)
    page.used = true
    packedArea += choice.slotW * choice.slotH
    frames.push({
      assetId: item.asset.id,
      name: item.name,
      page: pageIndex,
      x: drawX,
      y: drawY,
      w: choice.frameW,
      h: choice.frameH,
      sourceW: item.sourceW,
      sourceH: item.sourceH,
      trimmed: item.trimRect.w !== item.sourceW || item.trimRect.h !== item.sourceH || item.trimRect.x !== 0 || item.trimRect.y !== 0,
      offsetX: item.trimRect.x,
      offsetY: item.trimRect.y,
      rotated: choice.rotated,
    })

    cursorX += choice.slotW
    rowHeight = Math.max(rowHeight, choice.slotH)
  }

  const artifacts: ExportExecutionResult['artifacts'] = []
  for (let i = 0; i < pages.length; i += 1) {
    if (!pages[i].used) continue
    artifacts.push({
      fileName: `${task.outputFolder}/textures/atlas_${i + 1}.png`,
      mimeType: 'image/png',
      blob: await canvasToPngBlob(pages[i].canvas),
      category: 'texture',
    })
  }

  artifacts.push({
    fileName: `${task.outputFolder}/metadata/atlas.json`,
    mimeType: 'application/json',
    blob: toJsonBlob({
      profileName: task.profileName,
      atlasSize,
      policy: config.policy,
      allowRotate: config.allowRotate,
      padding,
      extrude,
      powerOfTwo: config.powerOfTwo,
      totalInput: task.assets.length,
      packedCount: frames.length,
      failedCount: failedAssets.length,
      failedAssets,
      pageCount: artifacts.filter((item) => item.category === 'texture').length,
      occupancy: Number(
        (
          packedArea /
          Math.max(1, artifacts.filter((item) => item.category === 'texture').length * atlasSize * atlasSize)
        ).toFixed(4),
      ),
      pages: artifacts.filter((item) => item.category === 'texture').map((item) => item.fileName.split('/').pop()),
      frames: frames.map((frame) => ({
        name: frame.name,
        page: frame.page,
        x: frame.x,
        y: frame.y,
        w: frame.w,
        h: frame.h,
        rotated: frame.rotated,
        source_w: frame.sourceW,
        source_h: frame.sourceH,
        trimmed: frame.trimmed,
        offset_x: frame.offsetX,
        offset_y: frame.offsetY,
      })),
    }),
    category: 'metadata',
  })

  return {
    artifacts,
    warnings,
    summary: `图集导出完成：输入 ${task.assets.length}，成功 ${frames.length}，失败 ${failedAssets.length}，${artifacts.filter((item) => item.category === 'texture').length} 页图集`,
  }
}
