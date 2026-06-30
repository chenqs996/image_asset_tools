import { useEffect, useState } from 'react'
import { runMattingBackground, runMattingBorder } from '../../../../core/services/mattingService'
import { providerRegistry } from '../../../../core/services/providerRegistry'
import type { ImageAsset } from '../../../../types/image'
import { DEFAULT_MATTING_CONFIG, type MattingConfig, type MattingResult } from '../../../../types/matting'

interface UseMattingWorkflowOptions {
  mattingAssets: ImageAsset[]
  mattingAsset: ImageAsset | null
}

export function useMattingWorkflow({ mattingAssets, mattingAsset }: UseMattingWorkflowOptions) {
  const [mattingConfig, setMattingConfig] = useState<MattingConfig>(DEFAULT_MATTING_CONFIG)
  const [mattingResults, setMattingResults] = useState<Record<string, MattingResult>>({})
  const [mattingStatus, setMattingStatus] = useState('')
  const [mattingProcessing, setMattingProcessing] = useState(false)
  const [showMattingConfigModal, setShowMattingConfigModal] = useState(false)

  useEffect(() => {
    providerRegistry.loadRuntimePlugins()
    return () => {
      Object.values(mattingResults).forEach((item) => URL.revokeObjectURL(item.outputUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setMattingResult = (result: MattingResult) => {
    setMattingResults((prev) => {
      const old = prev[result.assetId]
      if (old) URL.revokeObjectURL(old.outputUrl)
      return { ...prev, [result.assetId]: result }
    })
  }

  const resetMattingForCurrent = () => {
    if (!mattingAsset) return
    setMattingResults((prev) => {
      const current = prev[mattingAsset.id]
      if (current) URL.revokeObjectURL(current.outputUrl)
      const { [mattingAsset.id]: _removed, ...rest } = prev
      return rest
    })
    setMattingStatus(`已重置：${mattingAsset.name}`)
  }

  const resetMattingForAll = () => {
    setMattingResults((prev) => {
      Object.values(prev).forEach((item) => URL.revokeObjectURL(item.outputUrl))
      return {}
    })
    setMattingStatus('已重置全部图片改动')
  }

  const getMattingSourceAsset = (asset: ImageAsset) => {
    const latestResult = mattingResults[asset.id]
    if (!latestResult) return asset
    return {
      ...asset,
      objectUrl: latestResult.outputUrl,
    }
  }

  const applyBackgroundToActive = async () => {
    if (!mattingAsset) return
    setMattingProcessing(true)
    setMattingStatus(`抠除背景处理中：${mattingAsset.name}`)
    try {
      const result = await runMattingBackground(getMattingSourceAsset(mattingAsset), mattingConfig)
      setMattingResult(result)
      setMattingStatus(result.warning ?? '抠除背景完成')
    } finally {
      setMattingProcessing(false)
    }
  }

  const applyBackgroundToBatch = async () => {
    if (mattingAssets.length === 0) return
    setMattingProcessing(true)
    try {
      let finished = 0
      for (const asset of mattingAssets) {
        setMattingStatus(`批量抠除背景 ${finished + 1}/${mattingAssets.length}：${asset.name}`)
        const result = await runMattingBackground(getMattingSourceAsset(asset), mattingConfig)
        setMattingResult(result)
        finished += 1
      }
      setMattingStatus('批量抠除背景完成')
    } finally {
      setMattingProcessing(false)
    }
  }

  const applyBorderToActive = async () => {
    if (!mattingAsset) return
    setMattingProcessing(true)
    setMattingStatus(`抠除边框处理中：${mattingAsset.name}`)
    try {
      const result = await runMattingBorder(getMattingSourceAsset(mattingAsset), mattingConfig)
      setMattingResult(result)
      setMattingStatus(result.warning ?? '抠除边框完成')
    } finally {
      setMattingProcessing(false)
    }
  }

  const applyBorderToBatch = async () => {
    if (mattingAssets.length === 0) return
    setMattingProcessing(true)
    try {
      let finished = 0
      for (const asset of mattingAssets) {
        setMattingStatus(`批量抠除边框 ${finished + 1}/${mattingAssets.length}：${asset.name}`)
        const result = await runMattingBorder(getMattingSourceAsset(asset), mattingConfig)
        setMattingResult(result)
        finished += 1
      }
      setMattingStatus('批量抠除边框完成')
    } finally {
      setMattingProcessing(false)
    }
  }

  const updateMattingNumber = (key: 'threshold' | 'smooth' | 'denoise' | 'feather', value: string) => {
    const parsed = Number(value)
    setMattingConfig((prev) => ({ ...prev, [key]: Number.isFinite(parsed) ? parsed : 0 }))
  }

  const updateMattingTrim = (side: 'top' | 'right' | 'bottom' | 'left', value: string) => {
    const parsed = Math.max(0, Number(value) || 0)
    setMattingConfig((prev) => {
      if (side === 'top') {
        return { ...prev, removeOuterBorder: false, trimBorderTop: parsed }
      }
      if (side === 'right') {
        return { ...prev, removeOuterBorder: false, trimBorderRight: parsed }
      }
      if (side === 'bottom') {
        return { ...prev, removeOuterBorder: false, trimBorderBottom: parsed }
      }
      return { ...prev, removeOuterBorder: false, trimBorderLeft: parsed }
    })
  }

  const setBorderMode = (mode: 'auto' | 'manual') => {
    setMattingConfig((prev) =>
      mode === 'auto'
        ? {
            ...prev,
            removeOuterBorder: true,
            trimBorderTop: 0,
            trimBorderRight: 0,
            trimBorderBottom: 0,
            trimBorderLeft: 0,
          }
        : {
            ...prev,
            removeOuterBorder: false,
          },
    )
  }

  return {
    mattingConfig,
    setMattingConfig,
    mattingResults,
    mattingStatus,
    mattingProcessing,
    showMattingConfigModal,
    setShowMattingConfigModal,
    updateMattingNumber,
    updateMattingTrim,
    setBorderMode,
    resetMattingForCurrent,
    resetMattingForAll,
    applyBackgroundToActive,
    applyBackgroundToBatch,
    applyBorderToActive,
    applyBorderToBatch,
  }
}
