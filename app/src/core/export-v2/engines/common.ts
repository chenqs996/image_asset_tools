import type { ImageAsset } from '../../../types/image'

export function toJsonBlob(payload: unknown) {
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

export async function loadHtmlImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
    img.src = url
  })
}

export async function loadAssetImage(asset: ImageAsset) {
  return loadHtmlImage(asset.objectUrl)
}

export function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

export function fileNameWithoutExt(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('CANVAS_EXPORT_FAILED')
  return blob
}

export function parseNumberList(text: string) {
  return text
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
}
