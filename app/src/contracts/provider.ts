export type ProviderType = 'slice' | 'scale' | 'matting'

export interface ProviderCapabilities {
  backgrounds?: string[]
  supportsEdgePreference?: boolean
  supportsPreview?: boolean
  supportsBatch?: boolean
}

export interface ProviderManifest {
  id: string
  type: ProviderType
  version: string
  displayName: string
  entry: string
  runtime: 'native' | 'wasm' | 'onnx'
  capabilities: ProviderCapabilities
}

export interface IProvider {
  manifest: ProviderManifest
  validateConfig(config: unknown): { valid: boolean; reason?: string }
}
