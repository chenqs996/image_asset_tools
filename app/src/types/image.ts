export type SupportedImageFormat = 'png' | 'jpg' | 'jpeg' | 'webp' | 'bmp'

export interface ImageAsset {
  id: string
  name: string
  format: SupportedImageFormat
  width: number
  height: number
  size: number
  objectUrl: string
  file: File
}

export function isSupportedImageFile(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return !!ext && ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)
}
