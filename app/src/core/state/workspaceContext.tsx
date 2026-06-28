import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ImageAsset } from '../../types/image'
import { DEFAULT_SCALE_CONFIG, type ScaleConfig } from '../../types/scale'
import { DEFAULT_SLICE_CONFIG, type SliceConfig } from '../../types/slice'
import { DEFAULT_TIMELINE, moveFrame, type FrameTimeline } from '../../types/timeline'
import { WorkspaceContext, type WorkspaceContextValue } from './workspaceContextDef'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [assets, updateAssets] = useState<ImageAsset[]>([])
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null)
  const [sliceConfig, updateSliceConfig] = useState<SliceConfig>(DEFAULT_SLICE_CONFIG)
  const [scaleConfig, updateScaleConfig] = useState<ScaleConfig>(DEFAULT_SCALE_CONFIG)
  const [timeline, setTimeline] = useState<FrameTimeline>(DEFAULT_TIMELINE)

  const setAssets = useCallback((updater: (prev: ImageAsset[]) => ImageAsset[]) => {
    updateAssets((prev) => {
      const next = updater(prev)
      if (next.length === 0) {
        setActiveAssetId(null)
      } else if (!next.some((item) => item.id === activeAssetId)) {
        setActiveAssetId(next[0].id)
      }
      return next
    })
  }, [activeAssetId])

  const setSliceConfig = useCallback((updater: (prev: SliceConfig) => SliceConfig) => {
    updateSliceConfig((prev) => updater(prev))
  }, [])

  const setScaleConfig = useCallback((updater: (prev: ScaleConfig) => ScaleConfig) => {
    updateScaleConfig((prev) => updater(prev))
  }, [])

  const setTimelineFps = useCallback((fps: number) => {
    setTimeline((prev) => ({ ...prev, fps: Math.max(1, Math.floor(fps) || 1) }))
  }, [])

  const toggleTimelineLoop = useCallback(() => {
    setTimeline((prev) => ({ ...prev, loop: !prev.loop }))
  }, [])

  const reorderTimelineFrame = useCallback((from: number, to: number) => {
    setTimeline((prev) => ({ ...prev, frameIds: moveFrame(prev.frameIds, from, to) }))
  }, [])

  const removeTimelineFrame = useCallback((assetId: string) => {
    setTimeline((prev) => ({ ...prev, frameIds: prev.frameIds.filter((id) => id !== assetId) }))
  }, [])

  const clearAssets = useCallback(() => {
    assets.forEach((item) => URL.revokeObjectURL(item.objectUrl))
    updateAssets([])
    setActiveAssetId(null)
  }, [assets])

  useEffect(() => {
    return () => {
      assets.forEach((item) => URL.revokeObjectURL(item.objectUrl))
    }
  }, [assets])

  useEffect(() => {
    setTimeline((prev) => {
      const existing = prev.frameIds.filter((id) => assets.some((asset) => asset.id === id))
      const toAppend = assets.map((item) => item.id).filter((id) => !existing.includes(id))
      return {
        ...prev,
        frameIds: [...existing, ...toAppend],
      }
    })
  }, [assets])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      assets,
      activeAssetId,
      sliceConfig,
      scaleConfig,
      timeline,
      setAssets,
      setActiveAssetId,
      setSliceConfig,
      setScaleConfig,
      setTimelineFps,
      toggleTimelineLoop,
      reorderTimelineFrame,
      removeTimelineFrame,
      clearAssets,
    }),
    [
      assets,
      activeAssetId,
      sliceConfig,
      scaleConfig,
      timeline,
      setAssets,
      setSliceConfig,
      setScaleConfig,
      setTimelineFps,
      toggleTimelineLoop,
      reorderTimelineFrame,
      removeTimelineFrame,
      clearAssets,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
