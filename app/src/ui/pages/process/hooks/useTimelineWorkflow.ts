import { useEffect, useMemo, useState } from 'react'
import type { ImageAsset } from '../../../../types/image'

interface UseTimelineWorkflowOptions {
  timelineSourceAssets: ImageAsset[]
  fps: number
  loop: boolean
}

export function useTimelineWorkflow({ timelineSourceAssets, fps, loop }: UseTimelineWorkflowOptions) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [frameIndex, setFrameIndex] = useState(0)
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null)
  const [timelineFrameIds, setTimelineFrameIds] = useState<string[]>([])

  const timelineAssets = useMemo<ImageAsset[]>(
    () => timelineFrameIds
      .map((id) => timelineSourceAssets.find((item) => item.id === id))
      .filter((item): item is ImageAsset => Boolean(item)),
    [timelineFrameIds, timelineSourceAssets],
  )

  const currentFrame = timelineAssets.length > 0 ? timelineAssets[frameIndex % timelineAssets.length] : null

  useEffect(() => {
    setTimelineFrameIds((prev) => {
      const existing = prev.filter((id) => timelineSourceAssets.some((asset) => asset.id === id))
      const append = timelineSourceAssets.map((asset) => asset.id).filter((id) => !existing.includes(id))
      return [...existing, ...append]
    })
  }, [timelineSourceAssets])

  useEffect(() => {
    if (!isPlaying || timelineAssets.length <= 1) return
    const interval = window.setInterval(() => {
      setFrameIndex((prev) => {
        const next = prev + 1
        if (next < timelineAssets.length) return next
        return loop ? 0 : prev
      })
    }, Math.max(16, Math.floor(1000 / Math.max(1, fps))))
    return () => window.clearInterval(interval)
  }, [isPlaying, timelineAssets.length, fps, loop])

  useEffect(() => {
    if (frameIndex >= timelineAssets.length) {
      setFrameIndex(0)
    }
  }, [frameIndex, timelineAssets.length])

  const reorderTimelineFrame = (from: number, to: number) => {
    setTimelineFrameIds((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      if (item === undefined) return prev
      next.splice(to, 0, item)
      return next
    })
  }

  const removeTimelineFrame = (assetId: string) => {
    setTimelineFrameIds((prev) => prev.filter((id) => id !== assetId))
  }

  return {
    isPlaying,
    setIsPlaying,
    frameIndex,
    setFrameIndex,
    dragFromIndex,
    setDragFromIndex,
    timelineAssets,
    currentFrame,
    reorderTimelineFrame,
    removeTimelineFrame,
  }
}
