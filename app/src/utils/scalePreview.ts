import type { ScaleConfig, ScalePreviewItem } from '../types/scale'

function clampInt(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.floor(value))
}

export function buildScalePreview(
  originalWidth: number,
  originalHeight: number,
  config: ScaleConfig,
): ScalePreviewItem[] {
  if (config.mode === 'target') {
    const tw = clampInt(config.targetWidth, originalWidth)
    const th = clampInt(config.targetHeight, originalHeight)

    if (config.keepAspect) {
      const ratio = Math.min(tw / originalWidth, th / originalHeight)
      const width = Math.max(1, Math.floor(originalWidth * ratio))
      const height = Math.max(1, Math.floor(originalHeight * ratio))
      const blocked = width > originalWidth || height > originalHeight
      return [{ label: `${width}x${height}`, width, height, blocked }]
    }

    return [
      {
        label: `${tw}x${th}`,
        width: tw,
        height: th,
        blocked: tw > originalWidth || th > originalHeight,
      },
    ]
  }

  const ratios = config.ratiosText
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)

  return ratios.map((ratio) => {
    const width = Math.max(1, Math.floor(originalWidth * ratio))
    const height = Math.max(1, Math.floor(originalHeight * ratio))
    return {
      label: `${ratio}x`,
      width,
      height,
      blocked: width > originalWidth || height > originalHeight,
    }
  })
}
