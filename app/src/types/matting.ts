export type MattingAlgorithm = 'ai_general' | 'chroma_key' | 'checkerboard'
export type EdgePreference = 'keep_detail' | 'clean_edge'
export type MoveBatchStrategy = 'canvas_center' | 'median_anchor'

export interface MattingConfig {
  algorithm: MattingAlgorithm
  threshold: number
  smooth: number
  denoise: number
  feather: number
  edgePreference: EdgePreference
  removeOuterBorder: boolean
  trimBorderTop: number
  trimBorderRight: number
  trimBorderBottom: number
  trimBorderLeft: number
  moveBatchStrategy: MoveBatchStrategy
  moveAlphaThreshold: number
  bgColorHex: string
  modelPath: string
}

export interface MattingResult {
  assetId: string
  outputUrl: string
  algorithm: MattingAlgorithm
  warning?: string
}

export const DEFAULT_MATTING_CONFIG: MattingConfig = {
  algorithm: 'ai_general',
  threshold: 28,
  smooth: 2,
  denoise: 12,
  feather: 1,
  edgePreference: 'keep_detail',
  removeOuterBorder: true,
  trimBorderTop: 0,
  trimBorderRight: 0,
  trimBorderBottom: 0,
  trimBorderLeft: 0,
  moveBatchStrategy: 'canvas_center',
  moveAlphaThreshold: 12,
  bgColorHex: '#ffffff',
  modelPath: '/models/u2net.onnx',
}
