import { createContext } from 'react'
import type { ImageAsset } from '../../types/image'
import type { ScaleConfig } from '../../types/scale'
import type { SliceConfig } from '../../types/slice'
import type { FrameTimeline } from '../../types/timeline'

export interface WorkspaceContextValue {
  assets: ImageAsset[]
  activeAssetId: string | null
  sliceConfig: SliceConfig
  scaleConfig: ScaleConfig
  timeline: FrameTimeline
  setAssets: (updater: (prev: ImageAsset[]) => ImageAsset[]) => void
  setActiveAssetId: (id: string | null) => void
  setSliceConfig: (updater: (prev: SliceConfig) => SliceConfig) => void
  setScaleConfig: (updater: (prev: ScaleConfig) => ScaleConfig) => void
  setTimelineFps: (fps: number) => void
  toggleTimelineLoop: () => void
  reorderTimelineFrame: (from: number, to: number) => void
  removeTimelineFrame: (assetId: string) => void
  clearAssets: () => void
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
