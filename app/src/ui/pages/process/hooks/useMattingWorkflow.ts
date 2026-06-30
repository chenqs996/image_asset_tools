import { useEffect, useState } from 'react'
import { detectMattingAnchor, runMattingBackground, runMattingBorder, runMattingMove } from '../../../../core/services/mattingService'
import { providerRegistry } from '../../../../core/services/providerRegistry'
import type { ImageAsset } from '../../../../types/image'
import { DEFAULT_MATTING_CONFIG, type MattingConfig, type MattingResult } from '../../../../types/matting'

interface UseMattingWorkflowOptions {
  mattingAssets: ImageAsset[]
  mattingAsset: ImageAsset | null
}

interface MoveAnchor {
  x: number
  y: number
}

function formatMoveStats(
  records: Array<{ dx: number; dy: number }>,
  strategy: MattingConfig['moveBatchStrategy'],
  total: number,
  detected: number,
) {
  if (records.length === 0) {
    return strategy === 'median_anchor'
      ? `批量移动居中完成（中位锚点，未检测到有效前景 ${detected}/${total}）`
      : `批量移动居中完成（画布中心，未检测到有效前景 ${detected}/${total}）`
  }

  const absX = records.map((item) => Math.abs(item.dx))
  const absY = records.map((item) => Math.abs(item.dy))
  const avgX = absX.reduce((sum, value) => sum + value, 0) / absX.length
  const avgY = absY.reduce((sum, value) => sum + value, 0) / absY.length
  const maxX = Math.max(...absX)
  const maxY = Math.max(...absY)

  const strategyText = strategy === 'median_anchor' ? '中位锚点' : '画布中心'
  return `批量移动居中完成（${strategyText}）· 平均偏移 x=${avgX.toFixed(1)} y=${avgY.toFixed(1)} · 最大偏移 x=${maxX} y=${maxY} · 检测前景 ${detected}/${total}`
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

  const getMedianAnchor = (anchors: Array<MoveAnchor | null>): MoveAnchor | undefined => {
    const validX = anchors.map((item) => item?.x).filter((item): item is number => Number.isFinite(item))
    const validY = anchors.map((item) => item?.y).filter((item): item is number => Number.isFinite(item))
    if (validX.length === 0 || validY.length === 0) return undefined

    const sortedX = [...validX].sort((a, b) => a - b)
    const sortedY = [...validY].sort((a, b) => a - b)
    return {
      x: sortedX[Math.floor(sortedX.length / 2)],
      y: sortedY[Math.floor(sortedY.length / 2)],
    }
  }

  const applyMoveToActive = async () => {
    if (!mattingAsset) return
    setMattingProcessing(true)
    setMattingStatus(`移动居中处理中：${mattingAsset.name}`)
    try {
      const sourceAsset = getMattingSourceAsset(mattingAsset)
      let targetAnchor: MoveAnchor | undefined
      if (mattingConfig.moveBatchStrategy === 'median_anchor') {
        const sourceAssets = mattingAssets.map((asset) => getMattingSourceAsset(asset))
        const anchors = await Promise.all(sourceAssets.map((asset) => detectMattingAnchor(asset, mattingConfig)))
        targetAnchor = getMedianAnchor(anchors)
      }

      const result = await runMattingMove(sourceAsset, mattingConfig, targetAnchor)
      setMattingResult(result)
      setMattingStatus(result.warning ?? '移动居中完成')
    } finally {
      setMattingProcessing(false)
    }
  }

  const applyMoveToBatch = async () => {
    if (mattingAssets.length === 0) return
    setMattingProcessing(true)
    try {
      const sourceAssets = mattingAssets.map((asset) => getMattingSourceAsset(asset))
      const anchors = await Promise.all(sourceAssets.map((asset) => detectMattingAnchor(asset, mattingConfig)))
      const detectedCount = anchors.filter((item) => Boolean(item)).length
      let sharedAnchor: { x: number; y: number } | undefined

      if (mattingConfig.moveBatchStrategy === 'median_anchor') {
        sharedAnchor = getMedianAnchor(anchors)
      }

      let finished = 0
      const offsetRecords: Array<{ dx: number; dy: number }> = []
      for (let index = 0; index < sourceAssets.length; index += 1) {
        const asset = sourceAssets[index]
        const anchor = anchors[index]
        const target = sharedAnchor
          ? sharedAnchor
          : {
              x: (asset.width - 1) / 2,
              y: (asset.height - 1) / 2,
            }
        if (anchor) {
          offsetRecords.push({
            dx: Math.round(target.x - anchor.x),
            dy: Math.round(target.y - anchor.y),
          })
        }

        setMattingStatus(`批量移动居中 ${finished + 1}/${sourceAssets.length}：${asset.name}`)
        const result = await runMattingMove(asset, mattingConfig, sharedAnchor)
        setMattingResult(result)
        finished += 1
      }
      setMattingStatus(formatMoveStats(offsetRecords, mattingConfig.moveBatchStrategy, sourceAssets.length, detectedCount))
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

  const setMoveBatchStrategy = (strategy: MattingConfig['moveBatchStrategy']) => {
    setMattingConfig((prev) => ({ ...prev, moveBatchStrategy: strategy }))
  }

  const setMoveAlphaThreshold = (value: string) => {
    const parsed = Number(value)
    setMattingConfig((prev) => ({
      ...prev,
      moveAlphaThreshold: Number.isFinite(parsed) ? Math.max(0, Math.min(254, Math.floor(parsed))) : prev.moveAlphaThreshold,
    }))
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
    setMoveBatchStrategy,
    setMoveAlphaThreshold,
    resetMattingForCurrent,
    resetMattingForAll,
    applyBackgroundToActive,
    applyBackgroundToBatch,
    applyBorderToActive,
    applyBorderToBatch,
    applyMoveToActive,
    applyMoveToBatch,
  }
}
