let ortModule: typeof import('onnxruntime-web') | null = null
let onnxReady = false
let onnxError: string | null = null

export async function ensureOnnxRuntime(modelPath: string) {
  if (onnxReady) return { ready: true as const, error: null }

  try {
    if (!ortModule) {
      ortModule = await import('onnxruntime-web')
    }
    await ortModule.InferenceSession.create(modelPath, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
    onnxReady = true
    onnxError = null
    return { ready: true as const, error: null }
  } catch (error) {
    onnxReady = false
    onnxError = error instanceof Error ? error.message : 'ONNX_INIT_FAILED'
    return { ready: false as const, error: onnxError }
  }
}

export function getOnnxRuntimeState() {
  return {
    ready: onnxReady,
    error: onnxError,
  }
}
