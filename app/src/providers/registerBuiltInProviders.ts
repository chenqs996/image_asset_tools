import type { IProvider } from '../contracts/provider'
import type { ProviderRegistry } from '../core/services/providerRegistry'

const builtInMattingProvider: IProvider = {
  manifest: {
    id: 'matting.ai.general.v1',
    type: 'matting',
    version: '1.0.0',
    displayName: 'AI通用（ONNX Runtime）',
    entry: 'builtin://matting.ai.general.v1',
    runtime: 'onnx',
    capabilities: {
      backgrounds: ['pure-color', 'gray-grid'],
      supportsEdgePreference: true,
      supportsBatch: true,
      supportsPreview: true,
    },
  },
  validateConfig() {
    return { valid: true }
  },
}

export function registerBuiltInProviders(registry: ProviderRegistry) {
  registry.register(builtInMattingProvider)
}
