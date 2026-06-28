export type ScaleMode = 'ratio' | 'target'

export interface ScaleConfig {
  mode: ScaleMode
  ratiosText: string
  targetWidth: number
  targetHeight: number
  keepAspect: boolean
  downscaleOnly: true
}

export interface ScalePreviewItem {
  label: string
  width: number
  height: number
  blocked: boolean
}

export const DEFAULT_SCALE_CONFIG: ScaleConfig = {
  mode: 'ratio',
  ratiosText: '1,0.5,0.25',
  targetWidth: 1024,
  targetHeight: 1024,
  keepAspect: true,
  downscaleOnly: true,
}
