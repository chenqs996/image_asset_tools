import { isSupportedImageFile, type ImageAsset, type SupportedImageFormat } from '../../types/image'

function loadImageSize(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'))
    img.src = objectUrl
  })
}

function formatFromFile(file: File): SupportedImageFormat {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  if (ext === 'jpeg') return 'jpeg'
  if (ext === 'jpg') return 'jpg'
  if (ext === 'webp') return 'webp'
  if (ext === 'bmp') return 'bmp'
  return 'png'
}

function createAssetId(file: File) {
  return `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`
}

export async function importImageFiles(files: FileList | File[]) {
  const list = Array.from(files)
  const supported = list.filter(isSupportedImageFile)
  const assets: ImageAsset[] = []

  for (const file of supported) {
    const objectUrl = URL.createObjectURL(file)
    try {
      const { width, height } = await loadImageSize(objectUrl)
      assets.push({
        id: createAssetId(file),
        name: file.name,
        format: formatFromFile(file),
        width,
        height,
        size: file.size,
        objectUrl,
        file,
      })
    } catch {
      URL.revokeObjectURL(objectUrl)
    }
  }

  return assets
}
