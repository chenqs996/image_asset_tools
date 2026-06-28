export type MattingAlgorithm = 'ai_general' | 'chroma_key' | 'checkerboard'
export type EdgePreference = 'keep_detail' | 'clean_edge'

export interface MattingConfig {
  algorithm: MattingAlgorithm
  threshold: number
  smooth: number
  denoise: number
  feather: number
  edgePreference: EdgePreference
  removeOuterBorder: boolean
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
  bgColorHex: '#ffffff',
  modelPath: '/models/u2net.onnx',
}
