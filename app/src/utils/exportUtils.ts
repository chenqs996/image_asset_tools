import JSZip from 'jszip'
import type { ImageAsset } from '../types/image'

export type ExportFormat = 'PNG' | 'BMP' | 'WebP'

export interface ExportRule {
  prefix: string
  startIndex: number
  digits: number
  suffix: string
  format: ExportFormat
}

export interface DownloadTriggerOptions {
  zipFileName?: string
}

function toExt(format: ExportFormat) {
  if (format === 'BMP') return 'bmp'
  if (format === 'WebP') return 'webp'
  return 'png'
}

function mimeType(format: ExportFormat) {
  if (format === 'BMP') return 'image/bmp'
  if (format === 'WebP') return 'image/webp'
  return 'image/png'
}

function padNumber(value: number, digits: number) {
  return String(value).padStart(digits, '0')
}

function buildName(rule: ExportRule, idx: number) {
  const number = padNumber(rule.startIndex + idx, Math.max(1, rule.digits))
  const ext = toExt(rule.format)
  const suffix = rule.suffix ? `_${rule.suffix}` : ''
  return `${rule.prefix}_${number}${suffix}.${ext}`
}

async function drawToBlob(url: string, format: ExportFormat) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
    img.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('CANVAS_CONTEXT_FAILED')

  ctx.drawImage(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType(format), format === 'WebP' ? 0.95 : undefined),
  )
  if (!blob) throw new Error('EXPORT_BLOB_FAILED')
  return blob
}

export async function exportAssetsByRule(assets: ImageAsset[], rule: ExportRule) {
  const downloads: Array<{ fileName: string; url: string }> = []

  for (let i = 0; i < assets.length; i += 1) {
    const fileName = buildName(rule, i)
    const blob = await drawToBlob(assets[i].objectUrl, rule.format)
    const url = URL.createObjectURL(blob)
    downloads.push({ fileName, url })
  }

  return downloads
}

export function triggerDownloads(items: Array<{ fileName: string; url: string }>, options?: DownloadTriggerOptions) {
  if (items.length <= 0) return

  if (items.length === 1) {
    const item = items[0]
    const a = document.createElement('a')
    a.href = item.url
    a.download = item.fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(item.url)
    return
  }

  const zip = new JSZip()
  const requests = items.map(async (item) => {
    try {
      const response = await fetch(item.url)
      const blob = await response.blob()
      zip.file(item.fileName, blob)
    } finally {
      URL.revokeObjectURL(item.url)
    }
  })

  Promise.all(requests)
    .then(async () => {
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const zipUrl = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = zipUrl
      a.download = options?.zipFileName?.trim() ? options.zipFileName : '批量导出.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(zipUrl)
    })
    .catch(() => {
      // 若打包失败，不再触发多文件下载，避免浏览器弹窗轰炸
    })
}
