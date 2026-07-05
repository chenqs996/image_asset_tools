import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { importImageFiles } from '../../core/services/imageImportService'
import { useWorkspace } from '../../core/state/useWorkspace'
import { executeV2Export } from '../../core/export-v2/orchestrator'
import type { ExportTaskSpec } from '../../core/export-v2/types'
import { validateV2TaskSpec } from '../../core/export-v2/validation'
import { type MattingConfig } from '../../types/matting'
import { DEFAULT_SLICE_CONFIG } from '../../types/slice'
import type { ImageAsset } from '../../types/image'
import { exportAssetsByRule, triggerDownloads, type ExportFormat } from '../../utils/exportUtils'
import { generateSliceRects } from '../../utils/sliceGrid'
import { detectSplitLinesFromUrl } from '../../utils/lineDetect'
import { buildScalePreview } from '../../utils/scalePreview'
import { ProcessActionCard } from '../components/ProcessActionCard'
import { HorizontalImageScroller, type HorizontalImageScrollerItem } from '../components/HorizontalImageScroller'
import { ProcessImportModal } from './process/components/ProcessImportModal'
import { ProcessTransferActions } from './process/components/ProcessTransferActions'
import { useMattingWorkflow } from './process/hooks/useMattingWorkflow'
import { useTimelineWorkflow } from './process/hooks/useTimelineWorkflow'
import {
  TAB_ORDER,
  TAB_LABELS,
  buildInternalImportOptions,
  buildProcessedAssetsForTab,
  cloneAssetForImport,
  createEmptyTabAssets,
  fileNameWithoutExt,
  revokeAssetUrls,
  toSlicePreviewAsset,
  type ProcessTab,
  type SlicePreviewItem,
} from './process/processDomain'

type SliceSubTab = 'split' | 'multi_size'
type ExportInteractionMode = 'classic' | 'v2'
type V2ExportTemplate = 'atlas' | 'animation' | 'ui_slice' | 'godot_package'
type TimelineComposeMode = 'spritesheet'
type TimelineComposeLayout = 'row_major' | 'column_major'

interface TimelineGuidePoint {
  id: string
  x: number
  y: number
}

interface TimelineMoveResult {
  outputUrl: string
  width: number
  height: number
}

interface TimelineFrameGuides {
  linesX: number[]
  linesY: number[]
  points: TimelineGuidePoint[]
}

type SelectedTimelineGuide =
  | { type: 'point'; id: string }
  | { type: 'x'; value: number }
  | { type: 'y'; value: number }

const SCALE_PRESET_OPTIONS = [0.25, 0.5, 0.75, 1.5] as const
const CROP_PRESET_OPTIONS = [32, 128, 256, 512] as const

export function ProcessPage() {
  const [lineTool, setLineTool] = useState<'x' | 'y'>('x')
  const [detecting, setDetecting] = useState(false)
  const [draggingLine, setDraggingLine] = useState<{ axis: 'x' | 'y'; line: number } | null>(null)
  const [activeTab, setActiveTab] = useState<ProcessTab>('slice')
  const [sliceSubTab, setSliceSubTab] = useState<SliceSubTab>('split')
  const [selectedAssetsByTab, setSelectedAssetsByTab] = useState<Record<ProcessTab, string | null>>({
    slice: null,
    matting: null,
    timeline: null,
  })
  const [slicePreviewVisible, setSlicePreviewVisible] = useState(true)
  const [slicePreviewItems, setSlicePreviewItems] = useState<SlicePreviewItem[]>([])
  const [slicePreviewStatus, setSlicePreviewStatus] = useState('')
  const [resizePreviewAssets, setResizePreviewAssets] = useState<ImageAsset[]>([])
  const [resizePreviewStatus, setResizePreviewStatus] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [showInternalImportList, setShowInternalImportList] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportInteractionMode, setExportInteractionMode] = useState<ExportInteractionMode>('v2')
  const [v2ExportTemplate, setV2ExportTemplate] = useState<V2ExportTemplate>('atlas')
  const [prefix, setPrefix] = useState('asset')
  const [prefixTouched, setPrefixTouched] = useState(false)
  const [startIndex, setStartIndex] = useState(1)
  const [digits, setDigits] = useState(3)
  const [suffix, setSuffix] = useState('')
  const [format, setFormat] = useState<ExportFormat>('PNG')
  const [exportScope, setExportScope] = useState<'all' | 'selected'>('all')
  const [exportStatus, setExportStatus] = useState('')
  const [v2ProfileName, setV2ProfileName] = useState('godot_v2_profile')
  const [v2OutputFolder, setV2OutputFolder] = useState('exports/godot')
  const [v2AtlasAutoSize, setV2AtlasAutoSize] = useState(true)
  const [v2AtlasMaxSize, setV2AtlasMaxSize] = useState(2048)
  const [v2AtlasPadding, setV2AtlasPadding] = useState(2)
  const [v2AtlasExtrude, setV2AtlasExtrude] = useState(1)
  const [v2AtlasPolicy, setV2AtlasPolicy] = useState<'balanced' | 'min_pages' | 'min_waste'>('balanced')
  const [v2AtlasPowerOfTwo, setV2AtlasPowerOfTwo] = useState(true)
  const [v2AtlasAllowRotate, setV2AtlasAllowRotate] = useState(false)
  const [v2AnimExportSequence, setV2AnimExportSequence] = useState(true)
  const [v2AnimExportSpritesheet, setV2AnimExportSpritesheet] = useState(true)
  const [v2AnimExportPlayerDesc, setV2AnimExportPlayerDesc] = useState(true)
  const [v2AnimPivotMode, setV2AnimPivotMode] = useState<'center' | 'bottom_center' | 'custom'>('center')
  const [v2AnimPivotUnit, setV2AnimPivotUnit] = useState<'normalized' | 'pixel'>('normalized')
  const [v2AnimPivotX, setV2AnimPivotX] = useState('0.5')
  const [v2AnimPivotY, setV2AnimPivotY] = useState('0.5')
  const [v2UiEnable9Slice, setV2UiEnable9Slice] = useState(true)
  const [v2UiEnableMultiScale, setV2UiEnableMultiScale] = useState(true)
  const [v2UiEnableStateSplit, setV2UiEnableStateSplit] = useState(true)
  const [v2UiScaleRatios, setV2UiScaleRatios] = useState('1,1.5,2')
  const [v2UiStateSuffixRule, setV2UiStateSuffixRule] = useState('_normal,_hover,_pressed,_disabled')
  const [v2GodotMetadataFormat, setV2GodotMetadataFormat] = useState<'json'>('json')
  const [v2EnableManifest, setV2EnableManifest] = useState(true)
  const [v2EnableExportLog, setV2EnableExportLog] = useState(true)
  const [scalePresetRatio, setScalePresetRatio] = useState<number>(SCALE_PRESET_OPTIONS[0])
  const [cropPresetSize, setCropPresetSize] = useState<number>(CROP_PRESET_OPTIONS[0])
  const [showTimelineAddFrameModal, setShowTimelineAddFrameModal] = useState(false)
  const [pendingTimelineFrameIds, setPendingTimelineFrameIds] = useState<string[]>([])
  const [selectedTimelineFrameIds, setSelectedTimelineFrameIds] = useState<string[]>([])
  const [showTimelineComposeModal, setShowTimelineComposeModal] = useState(false)
  const [showTimelineAutoMoveModal, setShowTimelineAutoMoveModal] = useState(false)
  const [timelineComposeMode, setTimelineComposeMode] = useState<TimelineComposeMode>('spritesheet')
  const [timelineComposeLayout, setTimelineComposeLayout] = useState<TimelineComposeLayout>('row_major')
  const [timelineComposeRows, setTimelineComposeRows] = useState(4)
  const [timelineComposeCols, setTimelineComposeCols] = useState(4)
  const [timelinePreviewShowGridNumber, setTimelinePreviewShowGridNumber] = useState(true)
  const [timelineComposePreview, setTimelineComposePreview] = useState<{ imageUrl: string; meta: string } | null>(null)
  const [timelineComposeStatus, setTimelineComposeStatus] = useState('')
  const [timelineMoveAutoAlgorithm, setTimelineMoveAutoAlgorithm] = useState<'canvas_center' | 'median_anchor' | 'reference_frame'>('median_anchor')
  const [timelineMoveStep, setTimelineMoveStep] = useState(1)
  const [timelineMoveAlphaThreshold, setTimelineMoveAlphaThreshold] = useState(12)
  const [timelineMoveStatus, setTimelineMoveStatus] = useState('')
  const [timelineGuideDrawMode, setTimelineGuideDrawMode] = useState<'none' | 'x' | 'y' | 'point'>('none')
  const [timelineGuidesByFrame, setTimelineGuidesByFrame] = useState<Record<string, TimelineFrameGuides>>({})
  const [selectedTimelineGuideByFrame, setSelectedTimelineGuideByFrame] = useState<Record<string, SelectedTimelineGuide | null>>({})
  const [timelineMoveResults, setTimelineMoveResults] = useState<Record<string, TimelineMoveResult>>({})
  const [timelinePreviewRenderSize, setTimelinePreviewRenderSize] = useState({ width: 0, height: 0 })
  const [selectedExportPreviewId, setSelectedExportPreviewId] = useState<string | null>(null)
  const [exportPreviewLightbox, setExportPreviewLightbox] = useState<{
    imageUrl: string
    title: string
    meta: string
  } | null>(null)
  const [selectedSlicePreview, setSelectedSlicePreview] = useState<SlicePreviewItem | null>(null)
  const [selectedAssetPreview, setSelectedAssetPreview] = useState<ImageAsset | null>(null)
  const [previewRenderSize, setPreviewRenderSize] = useState({ width: 0, height: 0 })
  const [tabAssets, setTabAssets] = useState<Record<ProcessTab, ImageAsset[]>>(createEmptyTabAssets)

  const previewImageRef = useRef<HTMLImageElement | null>(null)
  const timelinePreviewImageRef = useRef<HTMLImageElement | null>(null)
  const latestTabAssetsRef = useRef<Record<ProcessTab, ImageAsset[]>>(createEmptyTabAssets())
  const latestSlicePreviewItemsRef = useRef<SlicePreviewItem[]>([])
  const latestResizePreviewAssetsRef = useRef<ImageAsset[]>([])
  const latestTimelineMoveResultsRef = useRef<Record<string, TimelineMoveResult>>({})
  const tabRefs = useRef<Record<ProcessTab, HTMLButtonElement | null>>({
    slice: null,
    matting: null,
    timeline: null,
  })

  const {
    sliceConfig,
    setSliceConfig,
    scaleConfig,
    setScaleConfig,
    timeline,
    setTimelineFps,
    toggleTimelineLoop,
  } = useWorkspace()

  useEffect(() => {
    const hasAnyAssets = TAB_ORDER.some((tab) => tabAssets[tab].length > 0)
    if (!hasAnyAssets) {
      setSelectedAssetsByTab({ slice: null, matting: null, timeline: null })
      return
    }

    setSelectedAssetsByTab((prev) => {
      const next: Record<ProcessTab, string | null> = { ...prev }
      for (const tab of TAB_ORDER) {
        const tabList = tabAssets[tab]
        const current = prev[tab]
        next[tab] = current && tabList.some((asset) => asset.id === current) ? current : (tabList[0]?.id ?? null)
      }
      return next
    })
  }, [tabAssets])

  useEffect(() => {
    latestTabAssetsRef.current = tabAssets
  }, [tabAssets])

  useEffect(() => {
    return () => {
      TAB_ORDER.forEach((tab) => revokeAssetUrls(latestTabAssetsRef.current[tab]))
    }
  }, [])

  const getAssetByTab = (tab: ProcessTab) => {
    const id = selectedAssetsByTab[tab]
    return tabAssets[tab].find((item) => item.id === id) ?? null
  }

  const sliceAsset = getAssetByTab('slice')
  const mattingAsset = getAssetByTab('matting')
  const activeTabAssets = tabAssets[activeTab]

  const {
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
    applyScaleToActive,
    applyScaleToBatch,
    applyCropToActive,
    applyCropToBatch,
    setScaleRatioX,
    setScaleRatioY,
    setScaleLockAspect,
    setCropSize,
  } = useMattingWorkflow({
    mattingAssets: tabAssets.matting,
    mattingAsset,
  })

  const {
    isPlaying,
    setIsPlaying,
    frameIndex,
    setFrameIndex,
    dragFromIndex,
    setDragFromIndex,
    timelineAssets,
    timelineFrameIds,
    reorderTimelineFrame,
    addTimelineFrames,
    clearTimelineFrames,
  } = useTimelineWorkflow({
    timelineSourceAssets: tabAssets.timeline,
    fps: timeline.fps,
    loop: timeline.loop,
  })

  const timelineDisplayAssets = useMemo<ImageAsset[]>(() => {
    return timelineAssets.map((asset) => {
      const moved = timelineMoveResults[asset.id]
      if (!moved) return asset
      return {
        ...asset,
        objectUrl: moved.outputUrl,
        width: moved.width,
        height: moved.height,
      }
    })
  }, [timelineAssets, timelineMoveResults])

  const currentTimelineFrame = timelineDisplayAssets.length > 0 ? timelineDisplayAssets[frameIndex % timelineDisplayAssets.length] : null
  const currentTimelineGuides = useMemo<TimelineFrameGuides>(() => {
    if (!currentTimelineFrame) {
      return { linesX: [], linesY: [], points: [] }
    }
    return timelineGuidesByFrame[currentTimelineFrame.id] ?? { linesX: [], linesY: [], points: [] }
  }, [currentTimelineFrame, timelineGuidesByFrame])
  const selectedTimelineGuide = useMemo<SelectedTimelineGuide | null>(() => {
    if (!currentTimelineFrame) return null
    return selectedTimelineGuideByFrame[currentTimelineFrame.id] ?? null
  }, [currentTimelineFrame, selectedTimelineGuideByFrame])
  const currentTimelineFrameHasEdits = useMemo(() => {
    if (!currentTimelineFrame) return false
    const hasMove = Boolean(timelineMoveResults[currentTimelineFrame.id])
    const guides = timelineGuidesByFrame[currentTimelineFrame.id]
    const hasGuides = Boolean(guides && (guides.linesX.length > 0 || guides.linesY.length > 0 || guides.points.length > 0))
    const hasSelectedGuide = Boolean(selectedTimelineGuideByFrame[currentTimelineFrame.id])
    return hasMove || hasGuides || hasSelectedGuide
  }, [currentTimelineFrame, selectedTimelineGuideByFrame, timelineGuidesByFrame, timelineMoveResults])

  const assetScrollerItems = useMemo<HorizontalImageScrollerItem[]>(
    () =>
      activeTabAssets.map((asset) => ({
        id: asset.id,
        imageUrl: asset.objectUrl,
        title: asset.name,
        metaLines: [`${asset.width}×${asset.height}`],
      })),
    [activeTabAssets],
  )

  const sliceRects = useMemo(() => {
    if (!sliceAsset) return []
    return generateSliceRects(sliceAsset.width, sliceAsset.height, sliceConfig)
  }, [sliceAsset, sliceConfig])

  const sliceOverlayLines = useMemo(() => {
    if (!sliceAsset || sliceRects.length === 0) {
      return { x: [] as number[], y: [] as number[] }
    }

    const xSet = new Set<number>()
    const ySet = new Set<number>()
    for (const rect of sliceRects) {
      xSet.add(rect.x)
      xSet.add(rect.x + rect.width)
      ySet.add(rect.y)
      ySet.add(rect.y + rect.height)
    }

    return {
      x: Array.from(xSet).filter((x) => x > 0 && x < sliceAsset.width).sort((a, b) => a - b),
      y: Array.from(ySet).filter((y) => y > 0 && y < sliceAsset.height).sort((a, b) => a - b),
    }
  }, [sliceAsset, sliceRects])

  const resizePreview = useMemo(() => {
    if (!sliceAsset) return []
    return buildScalePreview(sliceAsset.width, sliceAsset.height, scaleConfig)
  }, [sliceAsset, scaleConfig])

  const sliceResultAssets = useMemo<ImageAsset[]>(() => {
    if (sliceSubTab === 'split') {
      return slicePreviewItems.map(toSlicePreviewAsset)
    }
    return resizePreviewAssets
  }, [slicePreviewItems, sliceSubTab, resizePreviewAssets])

  const internalImportOptions = useMemo(
    () => buildInternalImportOptions({ activeTab, tabAssets, sliceResultAssets, mattingResults, timelineAssets: timelineDisplayAssets }),
    [activeTab, mattingResults, sliceResultAssets, tabAssets, timelineDisplayAssets],
  )

  const processedAssetsForActiveTab = useMemo<ImageAsset[]>(() => {
    return buildProcessedAssetsForTab({ activeTab, tabAssets, sliceResultAssets, mattingResults, timelineAssets: timelineDisplayAssets })
  }, [activeTab, mattingResults, sliceResultAssets, tabAssets, timelineDisplayAssets])

  const exportTargets = useMemo(() => {
    if (exportScope === 'selected') {
      return processedAssetsForActiveTab.filter((item) => item.id === selectedExportPreviewId)
    }
    return processedAssetsForActiveTab
  }, [exportScope, processedAssetsForActiveTab, selectedExportPreviewId])

  const slicePreviewScrollerItems = useMemo<HorizontalImageScrollerItem[]>(
    () =>
      slicePreviewItems.map((item) => ({
        id: item.id,
        imageUrl: item.objectUrl,
        title: `#${item.index}`,
        metaLines: [`x:${item.x} y:${item.y}`, `${item.width}×${item.height}`],
      })),
    [slicePreviewItems],
  )

  const exportPreviewItems = useMemo<HorizontalImageScrollerItem[]>(
    () =>
      processedAssetsForActiveTab.map((item) => ({
        id: item.id,
        imageUrl: item.objectUrl,
        title: item.name,
        metaLines: [`${item.width}×${item.height}`, `${item.format.toUpperCase()}`],
      })),
    [processedAssetsForActiveTab],
  )

  const timelineSourceOptions = useMemo(() => {
    return tabAssets.timeline
      .filter((asset) => !timelineFrameIds.includes(asset.id))
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        imageUrl: asset.objectUrl,
        width: asset.width,
        height: asset.height,
      }))
  }, [tabAssets.timeline, timelineFrameIds])

  const selectedSliceIndex = useMemo(() => {
    if (!selectedSlicePreview) return -1
    return slicePreviewItems.findIndex((item) => item.id === selectedSlicePreview.id)
  }, [selectedSlicePreview, slicePreviewItems])

  useEffect(() => {
    latestSlicePreviewItemsRef.current = slicePreviewItems
  }, [slicePreviewItems])

  useEffect(() => {
    latestResizePreviewAssetsRef.current = resizePreviewAssets
  }, [resizePreviewAssets])

  useEffect(() => {
    latestTimelineMoveResultsRef.current = timelineMoveResults
  }, [timelineMoveResults])

  useEffect(() => {
    setTimelineMoveResults((prev) => {
      const validIds = new Set(timelineAssets.map((asset) => asset.id))
      let changed = false
      const next: Record<string, TimelineMoveResult> = {}
      for (const [key, value] of Object.entries(prev)) {
        if (validIds.has(key)) {
          next[key] = value
        } else {
          URL.revokeObjectURL(value.outputUrl)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [timelineAssets])

  useEffect(() => {
    const validIds = new Set(timelineAssets.map((asset) => asset.id))
    setSelectedTimelineGuideByFrame((prev) => {
      let changed = false
      const next: Record<string, SelectedTimelineGuide | null> = {}
      for (const [frameId, selected] of Object.entries(prev)) {
        if (validIds.has(frameId)) {
          next[frameId] = selected
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [timelineAssets])

  useEffect(() => {
    return () => {
      Object.values(latestTimelineMoveResultsRef.current).forEach((item) => URL.revokeObjectURL(item.outputUrl))
    }
  }, [])

  useEffect(() => {
    setSelectedTimelineFrameIds((prev) => prev.filter((id) => timelineAssets.some((asset) => asset.id === id)))
  }, [timelineAssets])

  useEffect(() => {
    if (!selectedTimelineGuide) return
    if (selectedTimelineGuide.type === 'point') {
      if (!currentTimelineGuides.points.some((point) => point.id === selectedTimelineGuide.id)) {
        if (currentTimelineFrame) {
          setSelectedTimelineGuideByFrame((prev) => ({ ...prev, [currentTimelineFrame.id]: null }))
        }
      }
      return
    }
    if (selectedTimelineGuide.type === 'x' && !currentTimelineGuides.linesX.includes(selectedTimelineGuide.value)) {
      if (currentTimelineFrame) {
        setSelectedTimelineGuideByFrame((prev) => ({ ...prev, [currentTimelineFrame.id]: null }))
      }
      return
    }
    if (selectedTimelineGuide.type === 'y' && !currentTimelineGuides.linesY.includes(selectedTimelineGuide.value)) {
      if (currentTimelineFrame) {
        setSelectedTimelineGuideByFrame((prev) => ({ ...prev, [currentTimelineFrame.id]: null }))
      }
    }
  }, [currentTimelineFrame, currentTimelineGuides, selectedTimelineGuide])

  useEffect(() => {
    return () => {
      if (timelineComposePreview) {
        URL.revokeObjectURL(timelineComposePreview.imageUrl)
      }
    }
  }, [timelineComposePreview])

  useEffect(() => {
    if (activeTab !== 'slice') {
      setExportScope('all')
    }
  }, [activeTab])

  useEffect(() => {
    if (!showExportModal) return
    if (!prefixTouched && activeTabAssets.length > 0) {
      setPrefix(fileNameWithoutExt(activeTabAssets[0].name) || 'asset')
    }
    if (processedAssetsForActiveTab.length === 0) {
      setSelectedExportPreviewId(null)
      return
    }
    const exists = selectedExportPreviewId && processedAssetsForActiveTab.some((item) => item.id === selectedExportPreviewId)
    if (!exists) {
      setSelectedExportPreviewId(processedAssetsForActiveTab[0].id)
    }
  }, [showExportModal, processedAssetsForActiveTab, selectedExportPreviewId, activeTabAssets, prefixTouched])

  useEffect(() => {
    const img = previewImageRef.current
    if (!img) return

    const updateSize = () => {
      setPreviewRenderSize({ width: img.clientWidth, height: img.clientHeight })
    }

    updateSize()
    const observer = new ResizeObserver(() => updateSize())
    observer.observe(img)
    window.addEventListener('resize', updateSize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [sliceAsset?.id, activeTab])

  useEffect(() => {
    const img = timelinePreviewImageRef.current
    if (!img) return

    const updateSize = () => {
      setTimelinePreviewRenderSize({ width: img.clientWidth, height: img.clientHeight })
    }

    updateSize()
    const observer = new ResizeObserver(() => updateSize())
    observer.observe(img)
    window.addEventListener('resize', updateSize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [currentTimelineFrame?.id])

  const setSelectedAssetForTab = (tab: ProcessTab, assetId: string) => {
    setSelectedAssetsByTab((prev) => ({ ...prev, [tab]: assetId }))
  }

  const replaceAssetsForTab = (tab: ProcessTab, nextAssets: ImageAsset[]) => {
    setTabAssets((prev) => {
      revokeAssetUrls(prev[tab])
      return {
        ...prev,
        [tab]: nextAssets,
      }
    })
  }

  const updateNumber = (
    key: 'sliceWidth' | 'sliceHeight' | 'countX' | 'countY' | 'offsetX' | 'offsetY',
    value: string,
  ) => {
    const parsed = Number(value)
    setSliceConfig((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? parsed : 0,
    }))
  }

  const handleAutoDetectLines = async () => {
    if (!sliceAsset) return
    setDetecting(true)
    try {
      const detected = await detectSplitLinesFromUrl(sliceAsset.objectUrl)
      setSliceConfig((prev) => ({
        ...prev,
        mode: 'line_detect',
        linesX: detected.x,
        linesY: detected.y,
      }))
    } finally {
      setDetecting(false)
    }
  }

  const addManualLine = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!sliceAsset || sliceConfig.mode !== 'line_detect') return
    const rect = event.currentTarget.getBoundingClientRect()
    const scaleX = sliceAsset.width / rect.width
    const scaleY = sliceAsset.height / rect.height
    const x = Math.floor((event.clientX - rect.left) * scaleX)
    const y = Math.floor((event.clientY - rect.top) * scaleY)

    setSliceConfig((prev) => {
      if (lineTool === 'x') return { ...prev, linesX: [...prev.linesX, x].sort((a, b) => a - b) }
      return { ...prev, linesY: [...prev.linesY, y].sort((a, b) => a - b) }
    })
  }

  const removeLine = (axis: 'x' | 'y', value: number) => {
    setSliceConfig((prev) => {
      if (axis === 'x') return { ...prev, linesX: prev.linesX.filter((line) => line !== value) }
      return { ...prev, linesY: prev.linesY.filter((line) => line !== value) }
    })
  }

  const updateDraggedLine = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!sliceAsset || !draggingLine || sliceConfig.mode !== 'line_detect') return
    const rect = event.currentTarget.getBoundingClientRect()
    const scaleX = sliceAsset.width / rect.width
    const scaleY = sliceAsset.height / rect.height
    const x = Math.max(1, Math.min(sliceAsset.width - 1, Math.floor((event.clientX - rect.left) * scaleX)))
    const y = Math.max(1, Math.min(sliceAsset.height - 1, Math.floor((event.clientY - rect.top) * scaleY)))

    setSliceConfig((prev) => {
      if (draggingLine.axis === 'x') {
        const linesX = prev.linesX.map((line) => (line === draggingLine.line ? x : line)).sort((a, b) => a - b)
        return { ...prev, linesX }
      }
      const linesY = prev.linesY.map((line) => (line === draggingLine.line ? y : line)).sort((a, b) => a - b)
      return { ...prev, linesY }
    })
    setDraggingLine((prev) => (prev ? { ...prev, line: draggingLine.axis === 'x' ? x : y } : null))
  }

  const revokeSlicePreviewItems = (items: SlicePreviewItem[]) => {
    items.forEach((item) => URL.revokeObjectURL(item.objectUrl))
  }

  const revokeResizePreviewAssets = (assets: ImageAsset[]) => {
    assets.forEach((asset) => URL.revokeObjectURL(asset.objectUrl))
  }

  const createPreviewSlices = async () => {
    if (!sliceAsset || sliceRects.length === 0) {
      setSlicePreviewStatus('没有可预览的切片')
      return
    }

    setSlicePreviewVisible(true)
    setSlicePreviewStatus(`正在切分预览（${sliceRects.length} 片）...`)

    const sourceImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('PREVIEW_IMAGE_LOAD_FAILED'))
      img.src = sliceAsset.objectUrl
    })

    const nextItems: SlicePreviewItem[] = []
    for (const rect of sliceRects) {
      if (rect.width <= 0 || rect.height <= 0) continue
      const canvas = document.createElement('canvas')
      canvas.width = rect.width
      canvas.height = rect.height
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.drawImage(sourceImage, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) continue
      nextItems.push({
        id: `${sliceAsset.id}-slice-${rect.index}`,
        index: rect.index,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        objectUrl: URL.createObjectURL(blob),
      })
    }

    setSlicePreviewItems((prev) => {
      revokeSlicePreviewItems(prev)
      return nextItems
    })
    setSlicePreviewStatus(`预览已更新：${nextItems.length} 个切片（未保存）`)
  }

  const updateScaleNumber = (key: 'targetWidth' | 'targetHeight', value: string) => {
    const parsed = Number(value)
    setScaleConfig((prev) => ({ ...prev, [key]: Number.isFinite(parsed) ? parsed : 1 }))
  }

  const createResizePreviewAssets = async () => {
    if (!sliceAsset) {
      setResizePreviewStatus('请先选择素材')
      return
    }

    const validTargets = resizePreview.filter((item) => !item.blocked)
    if (validTargets.length === 0) {
      setResizePreviewStatus('没有可生成的低分辨率尺寸')
      return
    }

    setResizePreviewStatus(`正在生成 ${validTargets.length} 个低分辨率结果...`)

    const sourceImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('RESIZE_IMAGE_LOAD_FAILED'))
      img.src = sliceAsset.objectUrl
    })

    const base = fileNameWithoutExt(sliceAsset.name)
    const nextAssets: ImageAsset[] = []

    for (const target of validTargets) {
      const canvas = document.createElement('canvas')
      canvas.width = target.width
      canvas.height = target.height
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(sourceImage, 0, 0, target.width, target.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) continue

      const name = `${base}_${target.width}x${target.height}.png`
      const file = new File([blob], name, { type: blob.type || 'image/png' })
      nextAssets.push({
        id: `${sliceAsset.id}-resize-${target.width}x${target.height}`,
        name,
        format: 'png',
        width: target.width,
        height: target.height,
        size: blob.size,
        objectUrl: URL.createObjectURL(blob),
        file,
      })
    }

    setResizePreviewAssets((prev) => {
      revokeResizePreviewAssets(prev)
      return nextAssets
    })
    setResizePreviewStatus(`低分辨率结果已更新：${nextAssets.length} 张（未保存）`)
  }

  const resetResizeConfig = () => {
    setScaleConfig((prev) => ({
      ...prev,
      mode: 'ratio',
      ratiosText: '1,0.5,0.25',
      targetWidth: 1024,
      targetHeight: 1024,
      keepAspect: true,
    }))
    setResizePreviewStatus('低分辨率参数已重置')
    setResizePreviewAssets((prev) => {
      revokeResizePreviewAssets(prev)
      return []
    })
  }

  const resetSliceConfig = () => {
    setSliceConfig(() => ({ ...DEFAULT_SLICE_CONFIG }))
    setLineTool('x')
    setDraggingLine(null)
    setSlicePreviewVisible(true)
    setSlicePreviewStatus('切分参数已重置')
    setSlicePreviewItems((prev) => {
      revokeSlicePreviewItems(prev)
      return []
    })
  }

  useEffect(() => {
    return () => {
      revokeSlicePreviewItems(latestSlicePreviewItemsRef.current)
      revokeResizePreviewAssets(latestResizePreviewAssetsRef.current)
    }
  }, [])

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    const nextAssets = await importImageFiles(files)
    if (nextAssets.length === 0) return
    setTabAssets((prev) => ({
      ...prev,
      [activeTab]: [...prev[activeTab], ...nextAssets],
    }))
    setShowInternalImportList(false)
    setShowImportModal(false)
    event.currentTarget.value = ''
  }

  const closeImportModal = () => {
    setShowInternalImportList(false)
    setShowImportModal(false)
  }

  const handleImportFromInternal = async (optionId: string) => {
    const option = internalImportOptions.find((item) => item.id === optionId)
    if (!option || option.assets.length === 0) return

    const cloned = await Promise.all(
      option.assets.map((asset, index) => cloneAssetForImport(asset, asset.name.replace(/\.[^.]+$/, '') + `_imported_${index + 1}`)),
    )
    replaceAssetsForTab(activeTab, cloned)
    setShowInternalImportList(false)
    setShowImportModal(false)
  }

  const runExport = async () => {
    if (exportTargets.length === 0) {
      setExportStatus('没有可导出的内容')
      return
    }

    setExportStatus(`正在生成 ${exportTargets.length} 个导出文件...`)
    const downloads = await exportAssetsByRule(exportTargets, { prefix, startIndex, digits, suffix, format })
    triggerDownloads(downloads, {
      zipFileName: `${prefix || '素材'}-批量.zip`,
    })
    setExportStatus(`已触发下载：${downloads.length} 个文件`)
    setShowExportModal(false)
  }

  const runV2InteractionPreview = () => {
    void (async () => {
      const ratioList = v2UiScaleRatios
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item) && item > 0)
      const suffixes = v2UiStateSuffixRule
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      const scopeAssets = exportScope === 'selected' && selectedExportPreviewId
        ? processedAssetsForActiveTab.filter((item) => item.id === selectedExportPreviewId)
        : processedAssetsForActiveTab

      const payload: ExportTaskSpec['payload'] =
        v2ExportTemplate === 'atlas'
          ? {
              template: 'atlas',
              config: {
                autoSize: v2AtlasAutoSize,
                maxSize: v2AtlasMaxSize,
                padding: v2AtlasPadding,
                extrude: v2AtlasExtrude,
                policy: v2AtlasPolicy,
                powerOfTwo: v2AtlasPowerOfTwo,
                allowRotate: v2AtlasAllowRotate,
              },
            }
          : v2ExportTemplate === 'animation'
            ? {
                template: 'animation',
                config: {
                  exportSequence: v2AnimExportSequence,
                  exportSpritesheet: v2AnimExportSpritesheet,
                  exportPlayerDesc: v2AnimExportPlayerDesc,
                  pivotMode: v2AnimPivotMode,
                  pivotUnit: v2AnimPivotUnit,
                  pivotX: Number(v2AnimPivotX),
                  pivotY: Number(v2AnimPivotY),
                  fps: timeline.fps,
                  loop: timeline.loop,
                },
              }
            : v2ExportTemplate === 'ui_slice'
              ? {
                  template: 'ui_slice',
                  config: {
                    enable9Slice: v2UiEnable9Slice,
                    enableMultiScale: v2UiEnableMultiScale,
                    enableStateSplit: v2UiEnableStateSplit,
                    scaleRatios: ratioList,
                    stateSuffixes: suffixes,
                  },
                }
              : {
                  template: 'godot_package',
                  config: {
                    metadataFormat: v2GodotMetadataFormat,
                    includeManifest: v2EnableManifest,
                    includeExportLog: v2EnableExportLog,
                  },
                }

      const task: ExportTaskSpec = {
        profileName: v2ProfileName,
        outputFolder: v2OutputFolder,
        scope: exportScope,
        payload,
        assets: scopeAssets,
      }

      const issues = validateV2TaskSpec(task)
      if (issues.length > 0) {
        setExportStatus(`V2 导出校验未通过：${issues.join('；')}`)
        return
      }

      setExportStatus('V2 导出执行中...')
      try {
        const result = await executeV2Export(task)
        const downloads = result.artifacts.map((item) => ({
          fileName: item.fileName,
          url: URL.createObjectURL(item.blob),
        }))
        triggerDownloads(downloads, {
          zipFileName: `${(v2ProfileName || 'v2_export').trim()}.zip`,
        })
        const warningSuffix = result.warnings.length > 0 ? `，警告 ${result.warnings.length} 条` : ''
        setExportStatus(`${result.summary}${warningSuffix}`)
        setShowExportModal(false)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
        setExportStatus(`V2 导出失败：${message}`)
      }
    })()
  }

  const togglePendingTimelineFrame = (assetId: string) => {
    setPendingTimelineFrameIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId],
    )
  }

  const confirmAddTimelineFrames = () => {
    if (pendingTimelineFrameIds.length === 0) return
    addTimelineFrames(pendingTimelineFrameIds)
    setTimelineComposeStatus(`已添加帧：${pendingTimelineFrameIds.length} 张`)
    setPendingTimelineFrameIds([])
    setShowTimelineAddFrameModal(false)
  }

  const toggleTimelineFrameSelection = (assetId: string) => {
    setSelectedTimelineFrameIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId],
    )
  }

  const toggleSelectAllPendingTimelineFrames = () => {
    const allIds = timelineSourceOptions.map((asset) => asset.id)
    if (allIds.length === 0) return
    setPendingTimelineFrameIds((prev) => {
      const allSelected = allIds.every((id) => prev.includes(id))
      return allSelected ? [] : allIds
    })
  }

  const removeTimelineFrameWithRelatedData = (assetId: string) => {
    clearTimelineFrames([assetId])
    setSelectedTimelineFrameIds((prev) => prev.filter((id) => id !== assetId))
    setTimelineGuidesByFrame((prev) => {
      if (!(assetId in prev)) return prev
      const next = { ...prev }
      delete next[assetId]
      return next
    })
    setSelectedTimelineGuideByFrame((prev) => {
      if (!(assetId in prev)) return prev
      const next = { ...prev }
      delete next[assetId]
      return next
    })
    setTimelineMoveResults((prev) => {
      const current = prev[assetId]
      if (!current) return prev
      URL.revokeObjectURL(current.outputUrl)
      const next = { ...prev }
      delete next[assetId]
      return next
    })
  }

  const clearAllTimelineFramesWithRelatedData = () => {
    if (timelineAssets.length === 0) return
    const allIds = timelineAssets.map((asset) => asset.id)
    clearTimelineFrames(allIds)
    setSelectedTimelineFrameIds([])
    setPendingTimelineFrameIds([])
    setTimelineGuidesByFrame({})
    setSelectedTimelineGuideByFrame({})
    setTimelineMoveResults((prev) => {
      Object.values(prev).forEach((item) => URL.revokeObjectURL(item.outputUrl))
      return {}
    })
    setTimelineMoveStatus('已清除所有帧与关联改动')
    setTimelineComposeStatus(`已清除所有帧：${allIds.length} 张`)
  }

  const resetCurrentTimelineFrameChanges = () => {
    if (!currentTimelineFrame) return
    const frameId = currentTimelineFrame.id

    setTimelineMoveResults((prev) => {
      const current = prev[frameId]
      if (!current) return prev
      URL.revokeObjectURL(current.outputUrl)
      const next = { ...prev }
      delete next[frameId]
      return next
    })

    setTimelineGuidesByFrame((prev) => {
      if (!(frameId in prev)) return prev
      const next = { ...prev }
      delete next[frameId]
      return next
    })

    setSelectedTimelineGuideByFrame((prev) => {
      if (!(frameId in prev)) return prev
      const next = { ...prev }
      delete next[frameId]
      return next
    })

    setTimelineMoveStatus(`已重置当前帧：${currentTimelineFrame.name}`)
  }

  const updateTimelineComposePreview = (next: { imageUrl: string; meta: string } | null) => {
    setTimelineComposePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.imageUrl)
      return next
    })
  }

  const buildTimelineSpritesheet = async () => {
    if (timelineDisplayAssets.length === 0) {
      throw new Error('没有可合成的帧')
    }

    const rows = Math.max(1, Math.floor(timelineComposeRows))
    const cols = Math.max(1, Math.floor(timelineComposeCols))
    const capacity = rows * cols
    if (capacity <= 0) {
      throw new Error('行列设置无效')
    }

    const frames = timelineDisplayAssets.slice(0, capacity)
    const images = await Promise.all(
      frames.map(
        (asset) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => reject(new Error('TIMELINE_IMAGE_LOAD_FAILED'))
            img.src = asset.objectUrl
          }),
      ),
    )

    const cellW = Math.max(...images.map((img) => img.naturalWidth), 1)
    const cellH = Math.max(...images.map((img) => img.naturalHeight), 1)
    const canvas = document.createElement('canvas')
    canvas.width = cols * cellW
    canvas.height = rows * cellH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布上下文')

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const metaFrames: Array<{ index: number; name: string; row: number; col: number; x: number; y: number; w: number; h: number }> = []
    images.forEach((img, index) => {
      const row = timelineComposeLayout === 'row_major' ? Math.floor(index / cols) : index % rows
      const col = timelineComposeLayout === 'row_major' ? index % cols : Math.floor(index / rows)
      const x = col * cellW + Math.floor((cellW - img.naturalWidth) / 2)
      const y = row * cellH + Math.floor((cellH - img.naturalHeight) / 2)
      ctx.drawImage(img, x, y)
      metaFrames.push({
        index,
        name: frames[index].name,
        row,
        col,
        x,
        y,
        w: img.naturalWidth,
        h: img.naturalHeight,
      })
    })

    const sheetBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!sheetBlob) throw new Error('输出图片失败')

    const metaPayload = {
      mode: timelineComposeMode,
      layout: timelineComposeLayout,
      rows,
      cols,
      cellWidth: cellW,
      cellHeight: cellH,
      sheetWidth: canvas.width,
      sheetHeight: canvas.height,
      frameCount: frames.length,
      sourceFrameCount: timelineDisplayAssets.length,
      frames: metaFrames,
    }
    const metaBlob = new Blob([JSON.stringify(metaPayload, null, 2)], { type: 'application/json' })

    return {
      rows,
      cols,
      capacity,
      frameCount: frames.length,
      sourceFrameCount: timelineAssets.length,
      sheetBlob,
      metaBlob,
      metaPayload,
    }
  }

  const previewTimelineCompose = async () => {
    try {
      const result = await buildTimelineSpritesheet()
      const previewCanvas = document.createElement('canvas')
      previewCanvas.width = result.metaPayload.sheetWidth
      previewCanvas.height = result.metaPayload.sheetHeight
      const previewCtx = previewCanvas.getContext('2d')
      if (!previewCtx) throw new Error('预览画布创建失败')

      const sheetImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('PREVIEW_SHEET_LOAD_FAILED'))
        img.src = URL.createObjectURL(result.sheetBlob)
      })

      previewCtx.drawImage(sheetImage, 0, 0)
      if (timelinePreviewShowGridNumber) {
        previewCtx.strokeStyle = 'rgba(79, 111, 255, 0.7)'
        previewCtx.fillStyle = 'rgba(79, 111, 255, 0.9)'
        previewCtx.font = '12px sans-serif'
        for (let r = 0; r < result.rows; r += 1) {
          for (let c = 0; c < result.cols; c += 1) {
            const x = c * result.metaPayload.cellWidth
            const y = r * result.metaPayload.cellHeight
            previewCtx.strokeRect(x + 0.5, y + 0.5, result.metaPayload.cellWidth - 1, result.metaPayload.cellHeight - 1)
            previewCtx.fillText(`${r},${c}`, x + 6, y + 16)
          }
        }
      }

      const previewBlob = await new Promise<Blob | null>((resolve) => previewCanvas.toBlob(resolve, 'image/png'))
      if (!previewBlob) throw new Error('预览图片输出失败')
      updateTimelineComposePreview({
        imageUrl: URL.createObjectURL(previewBlob),
        meta: `${result.rows}×${result.cols} · ${result.metaPayload.sheetWidth}×${result.metaPayload.sheetHeight} · 帧 ${result.frameCount}/${result.sourceFrameCount}`,
      })
      setTimelineComposeStatus('预览已更新')
      URL.revokeObjectURL(sheetImage.src)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setTimelineComposeStatus(`预览失败：${message}`)
    }
  }

  const composeTimelineSpritesheet = async () => {
    try {
      const result = await buildTimelineSpritesheet()
      const fileBase = `timeline_spritesheet_${Date.now()}`
      triggerDownloads(
        [
          { fileName: `${fileBase}.png`, url: URL.createObjectURL(result.sheetBlob) },
        ],
      )

      const overflowText = result.sourceFrameCount > result.capacity ? `，超出 ${result.sourceFrameCount - result.capacity} 帧未参与合成` : ''
      setTimelineComposeStatus(`合成完成：${result.frameCount} 帧，${result.rows}×${result.cols}${overflowText}`)
      setShowTimelineComposeModal(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setTimelineComposeStatus(`合成失败：${message}`)
    }
  }

  const setTimelineMoveResult = (assetId: string, result: TimelineMoveResult) => {
    setTimelineMoveResults((prev) => {
      const old = prev[assetId]
      if (old) URL.revokeObjectURL(old.outputUrl)
      return {
        ...prev,
        [assetId]: result,
      }
    })
  }

  const mutateFrameGuides = (assetId: string, updater: (prev: TimelineFrameGuides) => TimelineFrameGuides) => {
    setTimelineGuidesByFrame((prev) => {
      const current = prev[assetId] ?? { linesX: [], linesY: [], points: [] }
      const next = updater(current)
      return {
        ...prev,
        [assetId]: next,
      }
    })
  }

  const shiftFrameGuides = (assetId: string, dx: number, dy: number, width: number, height: number) => {
    mutateFrameGuides(assetId, (prev) => ({
      linesX: prev.linesX.map((x) => Math.max(0, Math.min(width, x + dx))),
      linesY: prev.linesY.map((y) => Math.max(0, Math.min(height, y + dy))),
      points: prev.points.map((point) => ({
        ...point,
        x: Math.max(0, Math.min(width, point.x + dx)),
        y: Math.max(0, Math.min(height, point.y + dy)),
      })),
    }))
  }

  const syncSelectedGuideLineAfterFrameShift = (assetId: string, dx: number, dy: number, width: number, height: number) => {
    setSelectedTimelineGuideByFrame((prev) => {
      const selected = prev[assetId]
      if (!selected) return prev
      if (selected.type !== 'x' && selected.type !== 'y') return prev
      const moved = selected.type === 'x' ? selected.value + dx : selected.value + dy
      const limit = selected.type === 'x' ? width : height
      return {
        ...prev,
        [assetId]: {
          type: selected.type,
          value: Math.max(0, Math.min(limit, moved)),
        },
      }
    })
  }

  const setCurrentFrameSelectedGuide = (next: SelectedTimelineGuide | null) => {
    if (!currentTimelineFrame) return
    setSelectedTimelineGuideByFrame((prev) => ({
      ...prev,
      [currentTimelineFrame.id]: next,
    }))
  }

  const toggleCurrentFrameSelectedGuide = (candidate: SelectedTimelineGuide) => {
    const isSame =
      (selectedTimelineGuide?.type === 'point' && candidate.type === 'point' && selectedTimelineGuide.id === candidate.id) ||
      (selectedTimelineGuide?.type === 'x' && candidate.type === 'x' && selectedTimelineGuide.value === candidate.value) ||
      (selectedTimelineGuide?.type === 'y' && candidate.type === 'y' && selectedTimelineGuide.value === candidate.value)
    setCurrentFrameSelectedGuide(isSame ? null : candidate)
  }

  const detectTimelineAnchor = async (asset: ImageAsset, alphaThreshold: number) => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('TIMELINE_IMAGE_LOAD_FAILED'))
      img.src = asset.objectUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('TIMELINE_CONTEXT_FAILED')
    ctx.drawImage(image, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data

    const threshold = Math.max(0, Math.min(254, Math.floor(alphaThreshold)))
    let minX = canvas.width
    let minY = canvas.height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const alpha = pixels[(y * canvas.width + x) * 4 + 3]
        if (alpha <= threshold) continue
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }

    if (maxX < minX || maxY < minY) return null
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    }
  }

  const moveTimelineAsset = async (asset: ImageAsset, dx: number, dy: number): Promise<TimelineMoveResult> => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('TIMELINE_IMAGE_LOAD_FAILED'))
      img.src = asset.objectUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('TIMELINE_CONTEXT_FAILED')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, dx, dy)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('TIMELINE_MOVE_EXPORT_FAILED')

    return {
      outputUrl: URL.createObjectURL(blob),
      width: canvas.width,
      height: canvas.height,
    }
  }

  const applyTimelineAutoMove = async () => {
    if (timelineDisplayAssets.length === 0) {
      setTimelineMoveStatus('没有可移动的帧')
      return
    }

    const anchors = await Promise.all(
      timelineDisplayAssets.map(async (asset) => ({
        asset,
        anchor: await detectTimelineAnchor(asset, timelineMoveAlphaThreshold),
      })),
    )

    let targetX: number | null = null
    let targetY: number | null = null

    if (timelineMoveAutoAlgorithm === 'median_anchor') {
      const xs = anchors.map((item) => item.anchor?.x).filter((value): value is number => Number.isFinite(value))
      const ys = anchors.map((item) => item.anchor?.y).filter((value): value is number => Number.isFinite(value))
      if (xs.length === 0 || ys.length === 0) {
        setTimelineMoveStatus('自动移动失败：未检测到有效前景')
        return
      }
      xs.sort((a, b) => a - b)
      ys.sort((a, b) => a - b)
      targetX = xs[Math.floor(xs.length / 2)]
      targetY = ys[Math.floor(ys.length / 2)]
    } else if (timelineMoveAutoAlgorithm === 'reference_frame') {
      const reference = anchors[frameIndex] ?? anchors[0]
      if (!reference?.anchor) {
        setTimelineMoveStatus('自动移动失败：参考帧未检测到前景')
        return
      }
      targetX = reference.anchor.x
      targetY = reference.anchor.y
    }

    let movedCount = 0
    for (const { asset, anchor } of anchors) {
      const target =
        timelineMoveAutoAlgorithm === 'canvas_center'
          ? { x: (asset.width - 1) / 2, y: (asset.height - 1) / 2 }
          : { x: targetX ?? (asset.width - 1) / 2, y: targetY ?? (asset.height - 1) / 2 }

      if (!anchor) continue
      const dx = Math.round(target.x - anchor.x)
      const dy = Math.round(target.y - anchor.y)
      const moved = await moveTimelineAsset(asset, dx, dy)
      setTimelineMoveResult(asset.id, moved)
      shiftFrameGuides(asset.id, dx, dy, moved.width, moved.height)
      syncSelectedGuideLineAfterFrameShift(asset.id, dx, dy, moved.width, moved.height)
      movedCount += 1
    }

    setTimelineMoveStatus(`自动移动完成：${movedCount}/${timelineDisplayAssets.length} 帧`) 
  }

  const nudgeCurrentTimelineFrame = async (dx: number, dy: number) => {
    if (!currentTimelineFrame) return
    const moved = await moveTimelineAsset(currentTimelineFrame, dx, dy)
    setTimelineMoveResult(currentTimelineFrame.id, moved)
    shiftFrameGuides(currentTimelineFrame.id, dx, dy, moved.width, moved.height)
    syncSelectedGuideLineAfterFrameShift(currentTimelineFrame.id, dx, dy, moved.width, moved.height)
    setTimelineMoveStatus(`手动微调：${currentTimelineFrame.name}（dx=${dx}, dy=${dy}）`)
  }

  const clearTimelineMoveResults = () => {
    setTimelineMoveResults((prev) => {
      Object.values(prev).forEach((item) => URL.revokeObjectURL(item.outputUrl))
      return {}
    })
    setTimelineMoveStatus('已清除移动结果')
  }

  const resolveTimelineOverlayX = (x: number) => {
    if (!currentTimelineFrame) return '0%'
    if (timelinePreviewRenderSize.width > 0) return `${(x / currentTimelineFrame.width) * timelinePreviewRenderSize.width}px`
    return `${(x / currentTimelineFrame.width) * 100}%`
  }

  const resolveTimelineOverlayY = (y: number) => {
    if (!currentTimelineFrame) return '0%'
    if (timelinePreviewRenderSize.height > 0) return `${(y / currentTimelineFrame.height) * timelinePreviewRenderSize.height}px`
    return `${(y / currentTimelineFrame.height) * 100}%`
  }

  const handleTimelineGuideAdd = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!currentTimelineFrame || timelineGuideDrawMode === 'none') return
    const rect = event.currentTarget.getBoundingClientRect()
    const scaleX = currentTimelineFrame.width / rect.width
    const scaleY = currentTimelineFrame.height / rect.height
    const x = Math.max(0, Math.min(currentTimelineFrame.width, Math.floor((event.clientX - rect.left) * scaleX)))
    const y = Math.max(0, Math.min(currentTimelineFrame.height, Math.floor((event.clientY - rect.top) * scaleY)))

    if (timelineGuideDrawMode === 'x') {
      mutateFrameGuides(currentTimelineFrame.id, (prev) => ({
        ...prev,
        linesX: prev.linesX.includes(x) ? prev.linesX : [...prev.linesX, x],
      }))
      setCurrentFrameSelectedGuide({ type: 'x', value: x })
      return
    }
    if (timelineGuideDrawMode === 'y') {
      mutateFrameGuides(currentTimelineFrame.id, (prev) => ({
        ...prev,
        linesY: prev.linesY.includes(y) ? prev.linesY : [...prev.linesY, y],
      }))
      setCurrentFrameSelectedGuide({ type: 'y', value: y })
      return
    }
    const point = { id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, x, y }
    mutateFrameGuides(currentTimelineFrame.id, (prev) => ({
      ...prev,
      points: [...prev.points, point],
    }))
    setCurrentFrameSelectedGuide({ type: 'point', id: point.id })
  }

  const alignTimelineToSelectedGuide = async () => {
    if (!currentTimelineFrame) {
      setTimelineMoveStatus('请先选择当前帧')
      return
    }
    if (!selectedTimelineGuide) {
      setTimelineMoveStatus('请先选中一个基准')
      return
    }
    if (timelineDisplayAssets.length === 0) {
      setTimelineMoveStatus('没有可对齐的帧')
      return
    }

    const candidates = timelineDisplayAssets.filter((asset) => asset.id !== currentTimelineFrame.id)
    let eligibleCount = 0
    let movedCount = 0
    for (const asset of candidates) {
      const frameGuides = timelineGuidesByFrame[asset.id]
      if (!frameGuides) continue
      const frameSelectedGuide = selectedTimelineGuideByFrame[asset.id]
      if (!frameSelectedGuide) continue
      if (frameSelectedGuide.type !== selectedTimelineGuide.type) continue

      let dx = 0
      let dy = 0
      let canAlign = false

      if (selectedTimelineGuide.type === 'point') {
        if (frameSelectedGuide.type !== 'point') continue
        const target = currentTimelineGuides.points.find((point) => point.id === selectedTimelineGuide.id)
        if (!target) continue
        const sourcePoint = frameGuides.points.find((point) => point.id === frameSelectedGuide.id)
        if (!sourcePoint) continue
        dx = Math.round(target.x - sourcePoint.x)
        dy = Math.round(target.y - sourcePoint.y)
        canAlign = true
      } else if (selectedTimelineGuide.type === 'x') {
        if (frameSelectedGuide.type !== 'x') continue
        const sourceLine = frameSelectedGuide.value
        if (!frameGuides.linesX.includes(sourceLine)) continue
        dx = Math.round(selectedTimelineGuide.value - sourceLine)
        canAlign = true
      } else if (selectedTimelineGuide.type === 'y') {
        if (frameSelectedGuide.type !== 'y') continue
        const sourceLine = frameSelectedGuide.value
        if (!frameGuides.linesY.includes(sourceLine)) continue
        dy = Math.round(selectedTimelineGuide.value - sourceLine)
        canAlign = true
      }

      if (!canAlign) continue
      eligibleCount += 1
      const moved = await moveTimelineAsset(asset, dx, dy)
      setTimelineMoveResult(asset.id, moved)
      shiftFrameGuides(asset.id, dx, dy, moved.width, moved.height)
      syncSelectedGuideLineAfterFrameShift(asset.id, dx, dy, moved.width, moved.height)
      movedCount += 1
    }
    setTimelineMoveStatus(eligibleCount > 0 ? `对齐基准完成：${movedCount}/${eligibleCount} 帧` : '未找到可对齐帧：其他帧缺少同类型基准')
  }

  const centerSelectedTimelineGuideInCurrentFrame = async () => {
    if (!currentTimelineFrame) {
      setTimelineMoveStatus('请先选择当前帧')
      return
    }
    if (!selectedTimelineGuide) {
      setTimelineMoveStatus('请先选中一个基准')
      return
    }

    const centerX = Math.round(currentTimelineFrame.width / 2)
    const centerY = Math.round(currentTimelineFrame.height / 2)
    let dx = 0
    let dy = 0

    if (selectedTimelineGuide.type === 'point') {
      const point = currentTimelineGuides.points.find((item) => item.id === selectedTimelineGuide.id)
      if (!point) {
        setTimelineMoveStatus('选中的基准点不存在')
        return
      }
      dx = Math.round(centerX - point.x)
      dy = Math.round(centerY - point.y)
    } else if (selectedTimelineGuide.type === 'x') {
      if (!currentTimelineGuides.linesX.includes(selectedTimelineGuide.value)) {
        setTimelineMoveStatus('选中的竖线基准不存在')
        return
      }
      dx = Math.round(centerX - selectedTimelineGuide.value)
    } else {
      if (!currentTimelineGuides.linesY.includes(selectedTimelineGuide.value)) {
        setTimelineMoveStatus('选中的横线基准不存在')
        return
      }
      dy = Math.round(centerY - selectedTimelineGuide.value)
    }

    const moved = await moveTimelineAsset(currentTimelineFrame, dx, dy)
    setTimelineMoveResult(currentTimelineFrame.id, moved)
    shiftFrameGuides(currentTimelineFrame.id, dx, dy, moved.width, moved.height)
    syncSelectedGuideLineAfterFrameShift(currentTimelineFrame.id, dx, dy, moved.width, moved.height)
    setTimelineMoveStatus(`基准居中完成：${currentTimelineFrame.name}（dx=${dx}, dy=${dy}）`)
  }

  const switchTabByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = TAB_ORDER.indexOf(activeTab)
    if (event.key === 'ArrowRight') {
      const nextTab = TAB_ORDER[(currentIndex + 1) % TAB_ORDER.length]
      setActiveTab(nextTab)
      tabRefs.current[nextTab]?.focus()
      event.preventDefault()
      return
    }
    if (event.key === 'ArrowLeft') {
      const nextTab = TAB_ORDER[(currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length]
      setActiveTab(nextTab)
      tabRefs.current[nextTab]?.focus()
      event.preventDefault()
      return
    }
    if (event.key === 'Home') {
      setActiveTab('slice')
      tabRefs.current.slice?.focus()
      event.preventDefault()
      return
    }
    if (event.key === 'End') {
      setActiveTab('timeline')
      tabRefs.current.timeline?.focus()
      event.preventDefault()
    }
  }

  const switchSelectedSlice = (direction: 'prev' | 'next') => {
    if (selectedSliceIndex < 0 || slicePreviewItems.length === 0) return
    const nextIndex = direction === 'prev' ? selectedSliceIndex - 1 : selectedSliceIndex + 1
    if (nextIndex < 0 || nextIndex >= slicePreviewItems.length) return
    setSelectedSlicePreview(slicePreviewItems[nextIndex])
  }

  const resolveOverlayX = (x: number) => {
    if (!sliceAsset) return '0%'
    if (previewRenderSize.width > 0) return `${(x / sliceAsset.width) * previewRenderSize.width}px`
    return `${(x / sliceAsset.width) * 100}%`
  }

  const resolveOverlayY = (y: number) => {
    if (!sliceAsset) return '0%'
    if (previewRenderSize.height > 0) return `${(y / sliceAsset.height) * previewRenderSize.height}px`
    return `${(y / sliceAsset.height) * 100}%`
  }

  return (
    <section className="card">
      <div className="tabs-row" role="tablist" aria-label="处理功能分页" onKeyDown={switchTabByKeyboard}>
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            ref={(node) => {
              tabRefs.current[tab] = node
            }}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            className={activeTab === tab ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="panel asset-picker-panel">
        <ProcessTransferActions
          onOpenImport={() => {
            setShowInternalImportList(false)
            setShowImportModal(true)
          }}
          onClear={() => replaceAssetsForTab(activeTab, [])}
          onOpenExport={() => setShowExportModal(true)}
        />
        <HorizontalImageScroller
          title="素材选择"
          items={assetScrollerItems}
          selectedId={selectedAssetsByTab[activeTab]}
          onSelect={(id) => setSelectedAssetForTab(activeTab, id)}
          onZoom={(id) => {
            const target = activeTabAssets.find((item) => item.id === id)
            if (target) setSelectedAssetPreview(target)
          }}
          emptyText="暂无素材，请先导入"
        />
      </div>

      {activeTab === 'slice' && (
        <div role="tabpanel" aria-label="切分标签内容">
          <div className="panel" style={{ marginBottom: 12 }}>
            <div className="action-row" style={{ margin: 0 }}>
              <button type="button" className={sliceSubTab === 'split' ? 'btn' : 'btn ghost'} onClick={() => setSliceSubTab('split')}>切成多个</button>
              <button type="button" className={sliceSubTab === 'multi_size' ? 'btn' : 'btn ghost'} onClick={() => setSliceSubTab('multi_size')}>多尺寸低分图</button>
            </div>
          </div>

          {sliceSubTab === 'split' && (
            <div className="split-grid">
              <div className="panel">
                <h3>切分参数</h3>
                <div className="field-grid">
                  <label>切分模式</label>
                  <select className="input" value={sliceConfig.mode} onChange={(e) => setSliceConfig((prev) => ({ ...prev, mode: e.target.value as 'fixed_size' | 'fixed_count' | 'line_detect' }))}>
                    <option value="fixed_size">指定单片尺寸</option>
                    <option value="fixed_count">指定横竖数量</option>
                    <option value="line_detect">自动/手动切分线</option>
                  </select>

                  {sliceConfig.mode === 'fixed_size' ? (
                    <>
                      <label>slice_width</label>
                      <input className="input" type="number" min={1} value={sliceConfig.sliceWidth} onChange={(e) => updateNumber('sliceWidth', e.target.value)} />
                      <label>slice_height</label>
                      <input className="input" type="number" min={1} value={sliceConfig.sliceHeight} onChange={(e) => updateNumber('sliceHeight', e.target.value)} />
                    </>
                  ) : sliceConfig.mode === 'fixed_count' ? (
                    <>
                      <label>count_x</label>
                      <input className="input" type="number" min={1} value={sliceConfig.countX} onChange={(e) => updateNumber('countX', e.target.value)} />
                      <label>count_y</label>
                      <input className="input" type="number" min={1} value={sliceConfig.countY} onChange={(e) => updateNumber('countY', e.target.value)} />
                    </>
                  ) : (
                    <>
                      <label>自动识别线条</label>
                      <button type="button" className="btn" onClick={handleAutoDetectLines} disabled={detecting || !sliceAsset}>
                        {detecting ? '识别中...' : '边缘检测 + 投影峰值'}
                      </button>
                      <label>手动加线方向</label>
                      <div className="action-row">
                        <button type="button" className={lineTool === 'x' ? 'btn' : 'btn ghost'} onClick={() => setLineTool('x')}>竖线（X）</button>
                        <button type="button" className={lineTool === 'y' ? 'btn' : 'btn ghost'} onClick={() => setLineTool('y')}>横线（Y）</button>
                      </div>
                      <label>线条数量</label>
                      <div className="hint">X: {sliceConfig.linesX.length} 条，Y: {sliceConfig.linesY.length} 条</div>
                    </>
                  )}

                  <label>offset_x</label>
                  <input className="input" type="number" min={0} value={sliceConfig.offsetX} onChange={(e) => updateNumber('offsetX', e.target.value)} />
                  <label>offset_y</label>
                  <input className="input" type="number" min={0} value={sliceConfig.offsetY} onChange={(e) => updateNumber('offsetY', e.target.value)} />
                </div>
              </div>

              <div className="panel">
                <div className="preview-header-row">
                  <h3>切分预览</h3>
                  <div className="action-row" style={{ margin: 0 }}>
                    <button type="button" className="btn" onClick={createPreviewSlices} disabled={!sliceAsset}>预览</button>
                    <button type="button" className="btn ghost" onClick={resetSliceConfig}>重置</button>
                  </div>
                </div>

                {!sliceAsset ? (
                  <div className="empty">请先导入素材。</div>
                ) : !slicePreviewVisible ? (
                  <div className="empty">切分预览已隐藏。</div>
                ) : (
                  <>
                    <div className="preview-wrap">
                      <div
                        className={sliceConfig.mode === 'line_detect' ? 'preview-stage line-mode' : 'preview-stage'}
                        onClick={addManualLine}
                        onMouseMove={updateDraggedLine}
                        onMouseUp={() => setDraggingLine(null)}
                        onMouseLeave={() => setDraggingLine(null)}
                        style={previewRenderSize.width > 0 && previewRenderSize.height > 0 ? { width: previewRenderSize.width, height: previewRenderSize.height } : undefined}
                      >
                        <img
                          ref={previewImageRef}
                          src={sliceAsset.objectUrl}
                          alt={sliceAsset.name}
                          className="preview-img"
                          onLoad={(event) => {
                            setPreviewRenderSize({ width: event.currentTarget.clientWidth, height: event.currentTarget.clientHeight })
                          }}
                        />
                        {sliceConfig.mode !== 'line_detect' && (
                          <>
                            {sliceOverlayLines.x.map((x) => <div key={`sx-${x}`} className="slice-guide-line x" style={{ left: resolveOverlayX(x) }} />)}
                            {sliceOverlayLines.y.map((y) => <div key={`sy-${y}`} className="slice-guide-line y" style={{ top: resolveOverlayY(y) }} />)}
                          </>
                        )}
                        {sliceConfig.mode === 'line_detect' && (
                          <>
                            {sliceConfig.linesX.map((x) => (
                              <div key={`x-${x}`} className="manual-line x" style={{ left: resolveOverlayX(x) }} onMouseDown={(event) => {
                                event.stopPropagation(); setDraggingLine({ axis: 'x', line: x })
                              }} />
                            ))}
                            {sliceConfig.linesY.map((y) => (
                              <div key={`y-${y}`} className="manual-line y" style={{ top: resolveOverlayY(y) }} onMouseDown={(event) => {
                                event.stopPropagation(); setDraggingLine({ axis: 'y', line: y })
                              }} />
                            ))}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="hint" style={{ marginTop: 8 }}>{slicePreviewStatus}</div>

                    {slicePreviewItems.length > 0 && (
                      <div className="slice-list">
                        <HorizontalImageScroller
                          title="切片坐标预览"
                          items={slicePreviewScrollerItems}
                          selectedId={selectedSlicePreview?.id ?? null}
                          onSelect={(id) => {
                            const target = slicePreviewItems.find((item) => item.id === id)
                            if (target) setSelectedSlicePreview(target)
                          }}
                          onZoom={(id) => {
                            const target = slicePreviewItems.find((item) => item.id === id)
                            if (target) setSelectedSlicePreview(target)
                          }}
                        />
                      </div>
                    )}

                    {sliceConfig.mode === 'line_detect' && (
                      <div className="slice-list">
                        <h4>手动线条管理（点击删除）</h4>
                        <div className="line-badges">
                          {sliceConfig.linesX.map((line) => <button key={`bx-${line}`} type="button" className="line-badge" onClick={() => removeLine('x', line)}>X:{line} ×</button>)}
                          {sliceConfig.linesY.map((line) => <button key={`by-${line}`} type="button" className="line-badge" onClick={() => removeLine('y', line)}>Y:{line} ×</button>)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {sliceSubTab === 'multi_size' && (
            <div className="split-grid">
              <div className="panel">
                <h3>低分辨率参数</h3>
                <div className="field-grid two-col">
                  <label>缩放模式</label>
                  <select className="input" value={scaleConfig.mode} onChange={(e) => setScaleConfig((prev) => ({ ...prev, mode: e.target.value as 'ratio' | 'target' }))}>
                    <option value="ratio">按比例</option>
                    <option value="target">按目标分辨率</option>
                  </select>
                  {scaleConfig.mode === 'ratio' ? (
                    <>
                      <label>比例列表（逗号分隔）</label>
                      <input className="input" value={scaleConfig.ratiosText} onChange={(e) => setScaleConfig((prev) => ({ ...prev, ratiosText: e.target.value }))} />
                    </>
                  ) : (
                    <>
                      <label>target_width</label>
                      <input className="input" type="number" min={1} value={scaleConfig.targetWidth} onChange={(e) => updateScaleNumber('targetWidth', e.target.value)} />
                      <label>target_height</label>
                      <input className="input" type="number" min={1} value={scaleConfig.targetHeight} onChange={(e) => updateScaleNumber('targetHeight', e.target.value)} />
                    </>
                  )}
                </div>
                <div className="hint" style={{ marginTop: 10 }}>该功能用于将高分辨率素材生成多张不同尺寸的低分辨率图片。</div>
              </div>

              <div className="panel">
                <div className="preview-header-row">
                  <h3>低分辨率结果</h3>
                  <div className="action-row" style={{ margin: 0 }}>
                    <button type="button" className="btn" onClick={createResizePreviewAssets} disabled={!sliceAsset}>预览</button>
                    <button type="button" className="btn ghost" onClick={resetResizeConfig}>重置</button>
                  </div>
                </div>

                {!sliceAsset ? (
                  <div className="empty">请先导入素材。</div>
                ) : (
                  <>
                    <div className="line-badges" style={{ marginTop: 10 }}>
                      {resizePreview.length === 0 && <span className="hint">请输入有效比例或目标分辨率。</span>}
                      {resizePreview.map((item) => (
                        <span key={`${item.label}-${item.width}-${item.height}`} className="line-badge">
                          {item.label} → {item.width}×{item.height} {item.blocked ? '(禁止放大)' : ''}
                        </span>
                      ))}
                    </div>

                    <div className="hint" style={{ marginTop: 8 }}>{resizePreviewStatus}</div>

                    {resizePreviewAssets.length > 0 && (
                      <div className="slice-list">
                        <HorizontalImageScroller
                          title="低分辨率结果预览"
                          items={resizePreviewAssets.map((item) => ({
                            id: item.id,
                            imageUrl: item.objectUrl,
                            title: item.name,
                            metaLines: [`${item.width}×${item.height}`, `${item.format.toUpperCase()}`],
                          }))}
                          selectedId={selectedExportPreviewId}
                          onSelect={(id) => setSelectedExportPreviewId(id)}
                          onZoom={(id) => {
                            const target = resizePreviewAssets.find((item) => item.id === id)
                            if (target) {
                              setExportPreviewLightbox({
                                imageUrl: target.objectUrl,
                                title: target.name,
                                meta: `${target.width}×${target.height} · ${target.format.toUpperCase()}`,
                              })
                            }
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'matting' && (
        <div className="panel matting-panel" style={{ marginTop: 14 }} role="tabpanel" aria-label="调整图片标签内容">
          <div className="panel matting-preview-panel">
            <div className="preview-header-row">
              <h3>预览</h3>
              <div className="matting-preview-actions">
                <button type="button" className="btn ghost" onClick={resetMattingForCurrent} disabled={!mattingAsset || mattingProcessing}>重置</button>
                <button type="button" className="btn ghost" onClick={resetMattingForAll} disabled={Object.keys(mattingResults).length === 0 || mattingProcessing}>重置所有</button>
              </div>
            </div>
            {mattingAsset ? (
              <img
                className="matting-img matting-preview-image"
                src={mattingResults[mattingAsset.id]?.outputUrl ?? mattingAsset.objectUrl}
                alt={`${mattingAsset.name}-preview`}
              />
            ) : (
              <div className="empty">请先导入素材。</div>
            )}
          </div>

          <div className="matting-stage-panel">
            <ProcessActionCard
              title="抠除背景"
              density="compact"
              actions={(
                <>
                  <button type="button" className="btn" onClick={applyBackgroundToActive} disabled={!mattingAsset || mattingProcessing}>应用</button>
                  <button type="button" className="btn ghost" onClick={applyBackgroundToBatch} disabled={tabAssets.matting.length === 0 || mattingProcessing}>批量</button>
                </>
              )}
              config={(
                <div className="process-module-config-inline">
                  <button type="button" className="btn ghost gear-btn" aria-label="打开算法配置" onClick={() => setShowMattingConfigModal(true)}>
                    ⚙
                  </button>
                  <select className="input" value={mattingConfig.algorithm} onChange={(e) => setMattingConfig((prev) => ({ ...prev, algorithm: e.target.value as MattingConfig['algorithm'] }))}>
                    <option value="ai_general">AI通用（ONNX Runtime）</option>
                    <option value="chroma_key">纯色色键</option>
                    <option value="checkerboard">灰白方格专用</option>
                  </select>
                </div>
              )}
            />

            <ProcessActionCard
              title="抠除边框"
              density="compact"
              actions={(
                <>
                  <button type="button" className="btn" onClick={applyBorderToActive} disabled={!mattingAsset || mattingProcessing}>应用</button>
                  <button type="button" className="btn ghost" onClick={applyBorderToBatch} disabled={tabAssets.matting.length === 0 || mattingProcessing}>批量</button>
                </>
              )}
              config={(
                <div className="border-mode-config">
                  <div className="border-mode-toggle">
                    <label>
                      <input type="radio" name="border-mode" checked={mattingConfig.removeOuterBorder} onChange={() => setBorderMode('auto')} />
                      自动
                    </label>
                    <label>
                      <input type="radio" name="border-mode" checked={!mattingConfig.removeOuterBorder} onChange={() => setBorderMode('manual')} />
                      手动
                    </label>
                  </div>
                  <div className="trim-input-grid-4">
                    <label className="trim-field">
                      <span>上:</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={mattingConfig.trimBorderTop}
                        onChange={(e) => updateMattingTrim('top', e.target.value)}
                        disabled={mattingConfig.removeOuterBorder}
                      />
                    </label>
                    <label className="trim-field">
                      <span>下:</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={mattingConfig.trimBorderBottom}
                        onChange={(e) => updateMattingTrim('bottom', e.target.value)}
                        disabled={mattingConfig.removeOuterBorder}
                      />
                    </label>
                    <label className="trim-field">
                      <span>左:</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={mattingConfig.trimBorderLeft}
                        onChange={(e) => updateMattingTrim('left', e.target.value)}
                        disabled={mattingConfig.removeOuterBorder}
                      />
                    </label>
                    <label className="trim-field">
                      <span>右:</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={mattingConfig.trimBorderRight}
                        onChange={(e) => updateMattingTrim('right', e.target.value)}
                        disabled={mattingConfig.removeOuterBorder}
                      />
                    </label>
                  </div>
                </div>
              )}
            />

            <ProcessActionCard
              title="移动"
              density="compact"
              actions={(
                <>
                  <button type="button" className="btn" onClick={applyMoveToActive} disabled={!mattingAsset || mattingProcessing}>应用</button>
                  <button type="button" className="btn ghost" onClick={applyMoveToBatch} disabled={tabAssets.matting.length === 0 || mattingProcessing}>批量</button>
                </>
              )}
              config={(
                <div className="border-mode-config">
                  <div className="field-grid two-col" style={{ margin: 0 }}>
                    <label>批量策略</label>
                    <select
                      className="input"
                      value={mattingConfig.moveBatchStrategy}
                      onChange={(e) => setMoveBatchStrategy(e.target.value as MattingConfig['moveBatchStrategy'])}
                    >
                      <option value="canvas_center">画布中心（V1）</option>
                      <option value="median_anchor">中位锚点（V1.5）</option>
                    </select>
                    <label>前景阈值(alpha)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={254}
                      value={mattingConfig.moveAlphaThreshold}
                      onChange={(e) => setMoveAlphaThreshold(e.target.value)}
                    />
                  </div>
                </div>
              )}
            />

            <ProcessActionCard
              title="缩放"
              density="compact"
              actions={(
                <>
                  <button type="button" className="btn" onClick={applyScaleToActive} disabled={!mattingAsset || mattingProcessing}>应用</button>
                  <button type="button" className="btn ghost" onClick={applyScaleToBatch} disabled={tabAssets.matting.length === 0 || mattingProcessing}>批量</button>
                </>
              )}
              config={(
                <div className="border-mode-config" style={{ width: 'fit-content', marginLeft: 'auto' }}>
                  <label className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'flex-end' }}>
                    <input
                      type="checkbox"
                      checked={mattingConfig.scaleLockAspect}
                      onChange={(e) => setScaleLockAspect(e.target.checked)}
                    />
                    锁定 X/Y 比例
                  </label>
                  <div
                    className="field-grid"
                    style={{
                      margin: 0,
                      width: 'fit-content',
                      gridTemplateColumns: 'auto 92px auto 92px auto 128px',
                      alignItems: 'center',
                    }}
                  >
                    <label>X 比例</label>
                    <input
                      className="input"
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={mattingConfig.scaleRatioX}
                      onChange={(e) => setScaleRatioX(e.target.value)}
                    />
                    <label>Y 比例</label>
                    <input
                      className="input"
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={mattingConfig.scaleRatioY}
                      onChange={(e) => setScaleRatioY(e.target.value)}
                      disabled={mattingConfig.scaleLockAspect}
                    />
                    <label>常用比例</label>
                    <select
                      className="input"
                      value={scalePresetRatio}
                      onChange={(e) => {
                        const ratio = Number(e.target.value)
                        if (!Number.isFinite(ratio)) return
                        setScalePresetRatio(ratio)
                        setScaleRatioX(String(ratio))
                        setScaleRatioY(String(ratio))
                      }}
                      disabled={mattingProcessing}
                    >
                      {SCALE_PRESET_OPTIONS.map((ratio) => (
                        <option key={ratio} value={ratio}>{Math.round(ratio * 100)}%</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            />

            <ProcessActionCard
              title="裁剪"
              density="compact"
              actions={(
                <>
                  <button type="button" className="btn" onClick={applyCropToActive} disabled={!mattingAsset || mattingProcessing}>应用</button>
                  <button type="button" className="btn ghost" onClick={applyCropToBatch} disabled={tabAssets.matting.length === 0 || mattingProcessing}>批量</button>
                </>
              )}
              config={(
                <div className="border-mode-config" style={{ width: 'fit-content', marginLeft: 'auto' }}>
                  <div
                    className="field-grid"
                    style={{
                      margin: 0,
                      width: 'fit-content',
                      gridTemplateColumns: 'auto 104px auto 104px auto 128px',
                      alignItems: 'center',
                    }}
                  >
                    <label>目标宽度</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={mattingConfig.cropWidth}
                      onChange={(e) => setCropSize('cropWidth', e.target.value)}
                    />
                    <label>目标高度</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={mattingConfig.cropHeight}
                      onChange={(e) => setCropSize('cropHeight', e.target.value)}
                    />
                    <label>常用尺寸</label>
                    <select
                      className="input"
                      value={cropPresetSize}
                      onChange={(e) => {
                        const size = Number(e.target.value)
                        if (!Number.isFinite(size)) return
                        setCropPresetSize(size)
                        setCropSize('cropWidth', String(size))
                        setCropSize('cropHeight', String(size))
                      }}
                      disabled={mattingProcessing}
                    >
                      {CROP_PRESET_OPTIONS.map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            />

            <div className="hint matting-status">{mattingStatus}</div>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="panel" style={{ marginTop: 14 }} role="tabpanel" aria-label="动画标签内容">
          <h3>帧动画时间线</h3>
          <div className="action-row">
            <button type="button" className="btn" onClick={() => setIsPlaying((prev) => !prev)} disabled={timelineAssets.length <= 1}>{isPlaying ? '暂停' : '播放'}</button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setPendingTimelineFrameIds([])
                setShowTimelineAddFrameModal(true)
              }}
              disabled={tabAssets.timeline.length === 0}
            >
              添加帧
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={clearAllTimelineFramesWithRelatedData}
              disabled={timelineAssets.length === 0}
            >
              清除
            </button>
            <label className="hint">FPS</label>
            <input className="input" type="number" min={1} max={60} value={timeline.fps} onChange={(e) => setTimelineFps(Number(e.target.value))} style={{ width: 100 }} />
            <button type="button" className={timeline.loop ? 'btn' : 'btn ghost'} onClick={toggleTimelineLoop}>循环：{timeline.loop ? '开' : '关'}</button>
            <span className="hint">总帧数：{timelineAssets.length}</span>
            <button
              type="button"
              className="btn"
              style={{ marginLeft: 'auto' }}
              onClick={() => setShowTimelineComposeModal(true)}
              disabled={timelineAssets.length === 0}
            >
              合成
            </button>
          </div>

          <div className="timeline-workbench">
            <div className="timeline-preview">
              {currentTimelineFrame ? (
                <>
                  <div className="timeline-preview-stage" onClick={handleTimelineGuideAdd}>
                    <button
                      type="button"
                      className="btn ghost timeline-preview-reset-btn"
                      onClick={(event) => {
                        event.stopPropagation()
                        resetCurrentTimelineFrameChanges()
                      }}
                      disabled={!currentTimelineFrameHasEdits}
                    >
                      重置
                    </button>
                    <img
                      ref={timelinePreviewImageRef}
                      className="matting-img timeline-preview-image"
                      src={currentTimelineFrame.objectUrl}
                      alt={currentTimelineFrame.name}
                      onLoad={(event) => {
                        setTimelinePreviewRenderSize({ width: event.currentTarget.clientWidth, height: event.currentTarget.clientHeight })
                      }}
                    />

                    {currentTimelineGuides.linesX.map((x) => <div key={`tx-${x}`} className="slice-guide-line x" style={{ left: resolveTimelineOverlayX(x) }} />)}
                    {currentTimelineGuides.linesY.map((y) => <div key={`ty-${y}`} className="slice-guide-line y" style={{ top: resolveTimelineOverlayY(y) }} />)}
                    {currentTimelineGuides.points.map((point) => (
                      <div
                        key={point.id}
                        className="manual-line"
                        style={{
                          left: resolveTimelineOverlayX(point.x),
                          top: resolveTimelineOverlayY(point.y),
                          width: 8,
                          height: 8,
                          marginLeft: -4,
                          marginTop: -4,
                          borderRadius: '50%',
                          background: selectedTimelineGuide?.type === 'point' && selectedTimelineGuide.id === point.id ? 'rgba(255, 214, 10, 0.95)' : 'rgba(255, 214, 10, 0.65)',
                        }}
                      />
                    ))}
                  </div>
                  <div className="hint">{frameIndex + 1}/{timelineDisplayAssets.length} · {currentTimelineFrame.name}</div>
                </>
              ) : (
                <div className="empty">请先导入素材并点击“添加帧”。</div>
              )}
            </div>

            <div className="timeline-tools-panel">
              <div className="panel">
                <h4>移动</h4>
                <div className="action-row" style={{ margin: 0 }}>
                  <button type="button" className="btn" onClick={() => void applyTimelineAutoMove()}>自动</button>
                  <button type="button" className="btn ghost gear-btn" aria-label="自动移动设置" onClick={() => setShowTimelineAutoMoveModal(true)}>⚙</button>
                  <button type="button" className="btn ghost" onClick={clearTimelineMoveResults}>重置</button>
                </div>
                <div className="action-row" style={{ margin: 0 }}>
                  <label className="hint">步长</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={timelineMoveStep}
                    onChange={(e) => setTimelineMoveStep(Math.max(1, Number(e.target.value) || 1))}
                    style={{ width: 64 }}
                  />
                  <label className="hint">阈值</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={254}
                    value={timelineMoveAlphaThreshold}
                    onChange={(e) => setTimelineMoveAlphaThreshold(Math.max(0, Math.min(254, Number(e.target.value) || 0)))}
                    style={{ width: 64 }}
                  />
                </div>
                <div className="timeline-nudge-grid" style={{ marginTop: 6 }}>
                  <button type="button" className="btn ghost" onClick={() => void nudgeCurrentTimelineFrame(0, -timelineMoveStep)}>↑</button>
                  <button type="button" className="btn ghost" onClick={() => void nudgeCurrentTimelineFrame(-timelineMoveStep, 0)}>←</button>
                  <button type="button" className="btn ghost" onClick={() => void nudgeCurrentTimelineFrame(timelineMoveStep, 0)}>→</button>
                  <button type="button" className="btn ghost" onClick={() => void nudgeCurrentTimelineFrame(0, timelineMoveStep)}>↓</button>
                </div>
              </div>

              <div className="panel">
                <h4>基准</h4>
                <div className="timeline-guide-row">
                  <div className="timeline-guide-actions">
                    <button type="button" className={timelineGuideDrawMode === 'x' ? 'btn' : 'btn ghost'} onClick={() => setTimelineGuideDrawMode((prev) => (prev === 'x' ? 'none' : 'x'))}>竖线</button>
                    <button type="button" className={timelineGuideDrawMode === 'y' ? 'btn' : 'btn ghost'} onClick={() => setTimelineGuideDrawMode((prev) => (prev === 'y' ? 'none' : 'y'))}>横线</button>
                    <button type="button" className={timelineGuideDrawMode === 'point' ? 'btn' : 'btn ghost'} onClick={() => setTimelineGuideDrawMode((prev) => (prev === 'point' ? 'none' : 'point'))}>点</button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        if (!currentTimelineFrame) return
                        mutateFrameGuides(currentTimelineFrame.id, () => ({ linesX: [], linesY: [], points: [] }))
                        setCurrentFrameSelectedGuide(null)
                      }}
                    >
                      全清
                    </button>
                    <button type="button" className="btn" onClick={() => void alignTimelineToSelectedGuide()} disabled={!selectedTimelineGuide || timelineDisplayAssets.length === 0}>对齐基准</button>
                    <button type="button" className="btn ghost" onClick={() => void centerSelectedTimelineGuideInCurrentFrame()} disabled={!selectedTimelineGuide || !currentTimelineFrame}>基准居中</button>
                  </div>

                  <div className="timeline-guide-list">
                    {currentTimelineGuides.linesX.map((line) => (
                      <div key={`gx-${line}`} className="timeline-guide-chip">
                        <button
                          type="button"
                          className={selectedTimelineGuide?.type === 'x' && selectedTimelineGuide.value === line ? 'btn' : 'btn ghost'}
                          style={{ padding: '2px 8px', fontSize: 12 }}
                          onClick={() => {
                            toggleCurrentFrameSelectedGuide({ type: 'x', value: line })
                          }}
                        >
                          X:{line}
                        </button>
                        <button
                          type="button"
                          className="timeline-chip-close"
                          onClick={() => {
                            if (!currentTimelineFrame) return
                            mutateFrameGuides(currentTimelineFrame.id, (prev) => ({ ...prev, linesX: prev.linesX.filter((x) => x !== line) }))
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {currentTimelineGuides.linesY.map((line) => (
                      <div key={`gy-${line}`} className="timeline-guide-chip">
                        <button
                          type="button"
                          className={selectedTimelineGuide?.type === 'y' && selectedTimelineGuide.value === line ? 'btn' : 'btn ghost'}
                          style={{ padding: '2px 8px', fontSize: 12 }}
                          onClick={() => {
                            toggleCurrentFrameSelectedGuide({ type: 'y', value: line })
                          }}
                        >
                          Y:{line}
                        </button>
                        <button
                          type="button"
                          className="timeline-chip-close"
                          onClick={() => {
                            if (!currentTimelineFrame) return
                            mutateFrameGuides(currentTimelineFrame.id, (prev) => ({ ...prev, linesY: prev.linesY.filter((y) => y !== line) }))
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {currentTimelineGuides.points.map((point) => (
                      <div key={point.id} className="timeline-guide-chip">
                        <button
                          type="button"
                          className={selectedTimelineGuide?.type === 'point' && selectedTimelineGuide.id === point.id ? 'btn' : 'btn ghost'}
                          style={{ padding: '2px 8px', fontSize: 12 }}
                          onClick={() => {
                            toggleCurrentFrameSelectedGuide({ type: 'point', id: point.id })
                          }}
                        >
                          ({point.x},{point.y})
                        </button>
                        <button
                          type="button"
                          className="timeline-chip-close"
                          onClick={() => {
                            if (!currentTimelineFrame) return
                            mutateFrameGuides(currentTimelineFrame.id, (prev) => ({ ...prev, points: prev.points.filter((item) => item.id !== point.id) }))
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {currentTimelineGuides.linesX.length === 0 && currentTimelineGuides.linesY.length === 0 && currentTimelineGuides.points.length === 0 && (
                      <span className="hint">暂无基准</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {timelineMoveStatus && <div className="hint">{timelineMoveStatus}</div>}
          {timelineComposeStatus && <div className="hint">{timelineComposeStatus}</div>}

          <div className="timeline-list">
            {timelineDisplayAssets.map((asset, idx) => (
              <div
                key={asset!.id}
                className={idx === frameIndex ? 'timeline-item active' : 'timeline-item'}
                draggable
                onDragStart={() => setDragFromIndex(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFromIndex === null) return
                  reorderTimelineFrame(dragFromIndex, idx)
                  setDragFromIndex(null)
                }}
                onClick={() => setFrameIndex(idx)}
              >
                <label className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedTimelineFrameIds.includes(asset.id)}
                    onChange={() => toggleTimelineFrameSelection(asset.id)}
                  />
                  选中
                </label>
                <img src={asset.objectUrl} alt={asset.name} />
                <div>
                  <div className="asset-name">#{idx + 1} {asset.name}</div>
                  <small>{asset.width}×{asset.height}</small>
                </div>
                <button type="button" className="btn ghost" onClick={(event) => { event.stopPropagation(); removeTimelineFrameWithRelatedData(asset.id) }}>
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showTimelineAddFrameModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="添加动画帧">
          <div className="modal-card">
            <h3>添加帧</h3>
            <div className="hint">从当前导入素材中多选要加入动画序列的图片。</div>
            <div className="action-row" style={{ marginTop: 8, marginBottom: 0 }}>
              <button type="button" className="btn ghost" onClick={toggleSelectAllPendingTimelineFrames} disabled={timelineSourceOptions.length === 0}>
                {timelineSourceOptions.length > 0 && timelineSourceOptions.every((asset) => pendingTimelineFrameIds.includes(asset.id)) ? '取消全选' : '全选'}
              </button>
            </div>

            <div className="timeline-list" style={{ marginTop: 10, maxHeight: 360, overflow: 'auto' }}>
              {timelineSourceOptions.map((asset) => (
                <label key={asset.id} className="timeline-item" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={pendingTimelineFrameIds.includes(asset.id)}
                    onChange={() => togglePendingTimelineFrame(asset.id)}
                  />
                  <img src={asset.imageUrl} alt={asset.name} />
                  <div>
                    <div className="asset-name">{asset.name}</div>
                    <small>{asset.width}×{asset.height}</small>
                  </div>
                </label>
              ))}
              {timelineSourceOptions.length === 0 && <div className="empty">没有可添加的素材（可能都已在帧列表中）。</div>}
            </div>

            <div className="action-row">
              <button type="button" className="btn" onClick={confirmAddTimelineFrames} disabled={pendingTimelineFrameIds.length === 0}>确认添加</button>
              <button type="button" className="btn ghost" onClick={() => setShowTimelineAddFrameModal(false)}>取消</button>
              <span className="hint">已选 {pendingTimelineFrameIds.length} 张</span>
            </div>
          </div>
        </div>
      )}

      {showTimelineComposeModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="合成设置">
          <div className="modal-card">
            <h3>合成设置</h3>
            <div className="field-grid two-col" style={{ marginTop: 8 }}>
              <label>合成方式</label>
              <select className="input" value={timelineComposeMode} onChange={(e) => setTimelineComposeMode(e.target.value as TimelineComposeMode)}>
                <option value="spritesheet">精灵图</option>
              </select>
              <label>排布方式</label>
              <select className="input" value={timelineComposeLayout} onChange={(e) => setTimelineComposeLayout(e.target.value as TimelineComposeLayout)}>
                <option value="row_major">按行排列（先横后竖）</option>
                <option value="column_major">按列排列（先竖后横）</option>
              </select>
              <label>排布行数</label>
              <input
                className="input"
                type="number"
                min={1}
                value={timelineComposeRows}
                onChange={(e) => setTimelineComposeRows(Math.max(1, Number(e.target.value) || 1))}
              />
              <label>排布列数</label>
              <input
                className="input"
                type="number"
                min={1}
                value={timelineComposeCols}
                onChange={(e) => setTimelineComposeCols(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="hint" style={{ marginTop: 8 }}>当前帧顺序即合成顺序，可在时间线列表中拖拽调整。</div>
            <label className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={timelinePreviewShowGridNumber}
                onChange={(e) => setTimelinePreviewShowGridNumber(e.target.checked)}
              />
              预览显示格子编号
            </label>

            {timelineComposePreview && (
              <div style={{ marginTop: 12 }}>
                <img className="matting-img" src={timelineComposePreview.imageUrl} alt="合成预览" style={{ maxHeight: 260 }} />
                <div className="hint" style={{ marginTop: 6 }}>{timelineComposePreview.meta}</div>
              </div>
            )}

            <div className="action-row">
              <button type="button" className="btn ghost" onClick={() => void previewTimelineCompose()}>预览</button>
              <button type="button" className="btn" onClick={() => void composeTimelineSpritesheet()}>开始合成</button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  updateTimelineComposePreview(null)
                  setShowTimelineComposeModal(false)
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {showTimelineAutoMoveModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="自动移动设置">
          <div className="modal-card" style={{ maxWidth: 420 }}>
            <h3>自动移动设置</h3>
            <div className="field-grid" style={{ marginTop: 8 }}>
              <label>模式</label>
              <select className="input" value={timelineMoveAutoAlgorithm} onChange={(e) => setTimelineMoveAutoAlgorithm(e.target.value as 'canvas_center' | 'median_anchor' | 'reference_frame')}>
                <option value="canvas_center">画布中心</option>
                <option value="median_anchor">中位锚点</option>
                <option value="reference_frame">参考帧</option>
              </select>
            </div>
            <div className="action-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setShowTimelineAutoMoveModal(false)}>确定</button>
              <button type="button" className="btn ghost" onClick={() => setShowTimelineAutoMoveModal(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {showMattingConfigModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="算法配置">
          <div className="modal-card">
            <h3>算法配置</h3>
            <p className="hint">当前算法：{mattingConfig.algorithm === 'ai_general' ? 'AI通用（ONNX Runtime）' : mattingConfig.algorithm === 'chroma_key' ? '纯色色键' : '灰白方格专用'}</p>
            <div className="matting-config-grid">
              {mattingConfig.algorithm === 'ai_general' && (
                <section className="matting-config-group">
                  <h4>AI 通用参数</h4>
                  <div className="field-grid two-col">
                    <label>threshold</label>
                    <input className="input" type="number" value={mattingConfig.threshold} onChange={(e) => updateMattingNumber('threshold', e.target.value)} />
                    <label>smooth</label>
                    <input className="input" type="number" value={mattingConfig.smooth} onChange={(e) => updateMattingNumber('smooth', e.target.value)} />
                    <label>denoise</label>
                    <input className="input" type="number" value={mattingConfig.denoise} onChange={(e) => updateMattingNumber('denoise', e.target.value)} />
                    <label>feather</label>
                    <input className="input" type="number" value={mattingConfig.feather} onChange={(e) => updateMattingNumber('feather', e.target.value)} />
                    <label>边缘偏好</label>
                    <select className="input" value={mattingConfig.edgePreference} onChange={(e) => setMattingConfig((prev) => ({ ...prev, edgePreference: e.target.value as MattingConfig['edgePreference'] }))}>
                      <option value="keep_detail">保留细节</option>
                      <option value="clean_edge">去除毛边</option>
                    </select>
                    <label>ONNX 模型路径</label>
                    <input className="input" value={mattingConfig.modelPath} onChange={(e) => setMattingConfig((prev) => ({ ...prev, modelPath: e.target.value }))} />
                  </div>
                </section>
              )}

              {mattingConfig.algorithm === 'chroma_key' && (
                <section className="matting-config-group">
                  <h4>色键参数</h4>
                  <div className="field-grid two-col">
                    <label>threshold</label>
                    <input className="input" type="number" value={mattingConfig.threshold} onChange={(e) => updateMattingNumber('threshold', e.target.value)} />
                    <label>背景色（色键）</label>
                    <input className="input" type="color" value={mattingConfig.bgColorHex} onChange={(e) => setMattingConfig((prev) => ({ ...prev, bgColorHex: e.target.value }))} />
                    <label>smooth</label>
                    <input className="input" type="number" value={mattingConfig.smooth} onChange={(e) => updateMattingNumber('smooth', e.target.value)} />
                    <label>feather</label>
                    <input className="input" type="number" value={mattingConfig.feather} onChange={(e) => updateMattingNumber('feather', e.target.value)} />
                    <label>边缘偏好</label>
                    <select className="input" value={mattingConfig.edgePreference} onChange={(e) => setMattingConfig((prev) => ({ ...prev, edgePreference: e.target.value as MattingConfig['edgePreference'] }))}>
                      <option value="keep_detail">保留细节</option>
                      <option value="clean_edge">去除毛边</option>
                    </select>
                  </div>
                </section>
              )}

              {mattingConfig.algorithm === 'checkerboard' && (
                <section className="matting-config-group">
                  <h4>方格参数</h4>
                  <div className="field-grid two-col">
                    <label>threshold</label>
                    <input className="input" type="number" value={mattingConfig.threshold} onChange={(e) => updateMattingNumber('threshold', e.target.value)} />
                    <label>denoise</label>
                    <input className="input" type="number" value={mattingConfig.denoise} onChange={(e) => updateMattingNumber('denoise', e.target.value)} />
                    <label>feather</label>
                    <input className="input" type="number" value={mattingConfig.feather} onChange={(e) => updateMattingNumber('feather', e.target.value)} />
                    <label>边缘偏好</label>
                    <select className="input" value={mattingConfig.edgePreference} onChange={(e) => setMattingConfig((prev) => ({ ...prev, edgePreference: e.target.value as MattingConfig['edgePreference'] }))}>
                      <option value="keep_detail">保留细节</option>
                      <option value="clean_edge">去除毛边</option>
                    </select>
                  </div>
                </section>
              )}
            </div>

            <div className="action-row">
              <button type="button" className="btn ghost" onClick={() => setShowMattingConfigModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      <ProcessImportModal
        show={showImportModal}
        showInternalImportList={showInternalImportList}
        internalImportOptions={internalImportOptions}
        onToggleInternalImportList={() => setShowInternalImportList((prev) => !prev)}
        onImportFiles={handleImport}
        onImportFromInternal={handleImportFromInternal}
        onClose={closeImportModal}
      />

      {showExportModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="导出参数">
          <div className="modal-card export-modal-card">
            <h3>导出参数</h3>
            <div className="action-row" style={{ marginTop: 8 }}>
              <button type="button" className={exportInteractionMode === 'classic' ? 'btn' : 'btn ghost'} onClick={() => setExportInteractionMode('classic')}>经典导出</button>
              <button type="button" className={exportInteractionMode === 'v2' ? 'btn' : 'btn ghost'} onClick={() => setExportInteractionMode('v2')}>V2 交互预览</button>
            </div>

            {exportInteractionMode === 'classic' && (
              <div className="field-grid two-col">
                <label>导出范围</label>
                <select className="input" value={exportScope} onChange={(e) => setExportScope(e.target.value as 'all' | 'selected')}>
                  <option value="all">全部导出</option>
                  <option value="selected">导出选中</option>
                </select>
                <label>文件名前缀</label>
                <input className="input" value={prefix} onChange={(e) => {
                  setPrefixTouched(true)
                  setPrefix(e.target.value)
                }} />
                <label>起始序号</label>
                <input className="input" type="number" value={startIndex} onChange={(e) => setStartIndex(Math.max(0, Number(e.target.value) || 0))} />
                <label>序号位数</label>
                <input className="input" type="number" value={digits} onChange={(e) => setDigits(Math.max(1, Number(e.target.value) || 1))} />
                <label>文件名后缀</label>
                <input className="input" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
                <label>导出格式</label>
                <select className="input" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                  <option value="PNG">PNG</option>
                  <option value="BMP">BMP</option>
                  <option value="WebP">WebP</option>
                </select>
              </div>
            )}

            {exportInteractionMode === 'v2' && (
              <>
                <div className="action-row" style={{ marginTop: 8 }}>
                  <button type="button" className={v2ExportTemplate === 'atlas' ? 'btn' : 'btn ghost'} onClick={() => setV2ExportTemplate('atlas')}>图集打包</button>
                  <button type="button" className={v2ExportTemplate === 'animation' ? 'btn' : 'btn ghost'} onClick={() => setV2ExportTemplate('animation')}>动画序列导出</button>
                  <button type="button" className={v2ExportTemplate === 'ui_slice' ? 'btn' : 'btn ghost'} onClick={() => setV2ExportTemplate('ui_slice')}>游戏 UI 专用切图</button>
                  <button type="button" className={v2ExportTemplate === 'godot_package' ? 'btn' : 'btn ghost'} onClick={() => setV2ExportTemplate('godot_package')}>Godot 对接</button>
                </div>

                <div className="field-grid two-col">
                  <label>导出配置名称</label>
                  <input className="input" value={v2ProfileName} onChange={(e) => setV2ProfileName(e.target.value)} />
                  <label>输出目录</label>
                  <input className="input" value={v2OutputFolder} onChange={(e) => setV2OutputFolder(e.target.value)} />
                  <label>导出范围</label>
                  <select className="input" value={exportScope} onChange={(e) => setExportScope(e.target.value as 'all' | 'selected')}>
                    <option value="all">全部导出</option>
                    <option value="selected">导出选中</option>
                  </select>
                </div>

                {v2ExportTemplate === 'atlas' && (
                  <div className="field-grid two-col" style={{ marginTop: 12 }}>
                    <label>图集尺寸</label>
                    <div className="action-row" style={{ margin: 0 }}>
                      <label className="hint"><input type="checkbox" checked={v2AtlasAutoSize} onChange={(e) => setV2AtlasAutoSize(e.target.checked)} /> 自动估算并提示</label>
                    </div>
                    <label>最大尺寸</label>
                    <input className="input" type="number" value={v2AtlasMaxSize} disabled={v2AtlasAutoSize} onChange={(e) => setV2AtlasMaxSize(Math.max(256, Number(e.target.value) || 256))} />
                    <label>策略</label>
                    <select className="input" value={v2AtlasPolicy} onChange={(e) => setV2AtlasPolicy(e.target.value as 'balanced' | 'min_pages' | 'min_waste')}>
                      <option value="balanced">平衡策略</option>
                      <option value="min_pages">最少图集页数</option>
                      <option value="min_waste">最小空白率</option>
                    </select>
                    <label>Padding / Extrude</label>
                    <div className="action-row" style={{ margin: 0 }}>
                      <input className="input" type="number" value={v2AtlasPadding} onChange={(e) => setV2AtlasPadding(Math.max(0, Number(e.target.value) || 0))} style={{ width: 120 }} />
                      <input className="input" type="number" value={v2AtlasExtrude} onChange={(e) => setV2AtlasExtrude(Math.max(0, Number(e.target.value) || 0))} style={{ width: 120 }} />
                    </div>
                    <label>打包选项</label>
                    <div className="action-row" style={{ margin: 0 }}>
                      <label className="hint"><input type="checkbox" checked={v2AtlasPowerOfTwo} onChange={(e) => setV2AtlasPowerOfTwo(e.target.checked)} /> Power of Two</label>
                      <label className="hint"><input type="checkbox" checked={v2AtlasAllowRotate} onChange={(e) => setV2AtlasAllowRotate(e.target.checked)} /> 允许旋转</label>
                    </div>
                  </div>
                )}

                {v2ExportTemplate === 'animation' && (
                  <div className="field-grid two-col" style={{ marginTop: 12 }}>
                    <label>输出形态</label>
                    <div className="action-row" style={{ margin: 0 }}>
                      <label className="hint"><input type="checkbox" checked={v2AnimExportSequence} onChange={(e) => setV2AnimExportSequence(e.target.checked)} /> 序列 + JSON</label>
                      <label className="hint"><input type="checkbox" checked={v2AnimExportSpritesheet} onChange={(e) => setV2AnimExportSpritesheet(e.target.checked)} /> SpriteSheet + JSON</label>
                      <label className="hint"><input type="checkbox" checked={v2AnimExportPlayerDesc} onChange={(e) => setV2AnimExportPlayerDesc(e.target.checked)} /> AnimationPlayer 描述</label>
                    </div>
                    <label>锚点模式</label>
                    <select className="input" value={v2AnimPivotMode} onChange={(e) => setV2AnimPivotMode(e.target.value as 'center' | 'bottom_center' | 'custom')}>
                      <option value="center">中心</option>
                      <option value="bottom_center">底边中心</option>
                      <option value="custom">自定义</option>
                    </select>
                    <label>自定义单位</label>
                    <select className="input" value={v2AnimPivotUnit} disabled={v2AnimPivotMode !== 'custom'} onChange={(e) => setV2AnimPivotUnit(e.target.value as 'normalized' | 'pixel')}>
                      <option value="normalized">归一化坐标</option>
                      <option value="pixel">像素坐标</option>
                    </select>
                    <label>自定义锚点 X / Y</label>
                    <div className="action-row" style={{ margin: 0 }}>
                      <input className="input" value={v2AnimPivotX} disabled={v2AnimPivotMode !== 'custom'} onChange={(e) => setV2AnimPivotX(e.target.value)} style={{ width: 140 }} />
                      <input className="input" value={v2AnimPivotY} disabled={v2AnimPivotMode !== 'custom'} onChange={(e) => setV2AnimPivotY(e.target.value)} style={{ width: 140 }} />
                    </div>
                  </div>
                )}

                {v2ExportTemplate === 'ui_slice' && (
                  <div className="field-grid two-col" style={{ marginTop: 12 }}>
                    <label>能力开关</label>
                    <div className="action-row" style={{ margin: 0 }}>
                      <label className="hint"><input type="checkbox" checked={v2UiEnable9Slice} onChange={(e) => setV2UiEnable9Slice(e.target.checked)} /> 九宫格切图</label>
                      <label className="hint"><input type="checkbox" checked={v2UiEnableMultiScale} onChange={(e) => setV2UiEnableMultiScale(e.target.checked)} /> 多倍率导出</label>
                      <label className="hint"><input type="checkbox" checked={v2UiEnableStateSplit} onChange={(e) => setV2UiEnableStateSplit(e.target.checked)} /> 状态图拆分</label>
                    </div>
                    <label>倍率列表</label>
                    <input className="input" value={v2UiScaleRatios} onChange={(e) => setV2UiScaleRatios(e.target.value)} />
                    <label>状态后缀规则</label>
                    <input className="input" value={v2UiStateSuffixRule} onChange={(e) => setV2UiStateSuffixRule(e.target.value)} />
                  </div>
                )}

                {v2ExportTemplate === 'godot_package' && (
                  <div className="field-grid two-col" style={{ marginTop: 12 }}>
                    <label>目标平台</label>
                    <input className="input" value="Godot 4.x" disabled />
                    <label>Metadata 格式</label>
                    <select className="input" value={v2GodotMetadataFormat} onChange={(e) => setV2GodotMetadataFormat(e.target.value as 'json')}>
                      <option value="json">JSON</option>
                    </select>
                    <label>附加产物</label>
                    <div className="action-row" style={{ margin: 0 }}>
                      <label className="hint"><input type="checkbox" checked={v2EnableManifest} onChange={(e) => setV2EnableManifest(e.target.checked)} /> 生成 manifest</label>
                      <label className="hint"><input type="checkbox" checked={v2EnableExportLog} onChange={(e) => setV2EnableExportLog(e.target.checked)} /> 生成导出日志</label>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="slice-list" style={{ marginTop: 12 }}>
              <HorizontalImageScroller
                title="导出预览"
                items={exportPreviewItems}
                selectedId={selectedExportPreviewId}
                onSelect={(id) => setSelectedExportPreviewId(id)}
                onZoom={(id) => {
                  const target = processedAssetsForActiveTab.find((item) => item.id === id)
                  if (!target) return
                  setExportPreviewLightbox({
                    imageUrl: target.objectUrl,
                    title: target.name,
                    meta: `${target.width}×${target.height} · ${target.format.toUpperCase()}`,
                  })
                }}
                emptyText="当前没有可导出的图片"
              />
            </div>

            <div className="action-row">
              <button type="button" className="btn" onClick={exportInteractionMode === 'classic' ? runExport : runV2InteractionPreview}>
                {exportInteractionMode === 'classic' ? '确认导出' : '确认导出（V2）'}
              </button>
              <button type="button" className="btn ghost" onClick={() => setShowExportModal(false)}>取消</button>
              <span className="hint">多文件自动打包为 ZIP，一次下载。</span>
              <span className="hint">{exportStatus}</span>
            </div>
          </div>
        </div>
      )}

      {exportPreviewLightbox && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="导出预览放大图" onClick={() => setExportPreviewLightbox(null)}>
          <div className="modal-card slice-lightbox" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="lightbox-close" aria-label="关闭导出预览" onClick={() => setExportPreviewLightbox(null)}>✕</button>
            <h3>{exportPreviewLightbox.title}</h3>
            <img className="lightbox-image" src={exportPreviewLightbox.imageUrl} alt={exportPreviewLightbox.title} />
            <div className="hint">{exportPreviewLightbox.meta}</div>
          </div>
        </div>
      )}

      {selectedSlicePreview && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="切片放大预览" onClick={() => setSelectedSlicePreview(null)}>
          <div className="modal-card slice-lightbox" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="lightbox-close" aria-label="关闭切片预览" onClick={() => setSelectedSlicePreview(null)}>✕</button>
            <h3>切片 #{selectedSlicePreview.index}</h3>
            <div className="lightbox-image-wrap">
              <button type="button" className="lightbox-nav left" aria-label="上一张切片" disabled={selectedSliceIndex <= 0} onClick={() => switchSelectedSlice('prev')}>‹</button>
              <img className="lightbox-image" src={selectedSlicePreview.objectUrl} alt={`slice-preview-${selectedSlicePreview.index}`} />
              <button type="button" className="lightbox-nav right" aria-label="下一张切片" disabled={selectedSliceIndex < 0 || selectedSliceIndex >= slicePreviewItems.length - 1} onClick={() => switchSelectedSlice('next')}>›</button>
            </div>
            <div className="hint">坐标 x:{selectedSlicePreview.x} y:{selectedSlicePreview.y} · 尺寸 {selectedSlicePreview.width}×{selectedSlicePreview.height}</div>
          </div>
        </div>
      )}

      {selectedAssetPreview && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="素材放大预览" onClick={() => setSelectedAssetPreview(null)}>
          <div className="modal-card slice-lightbox" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="lightbox-close" aria-label="关闭素材预览" onClick={() => setSelectedAssetPreview(null)}>✕</button>
            <h3>{selectedAssetPreview.name}</h3>
            <img className="lightbox-image" src={selectedAssetPreview.objectUrl} alt={selectedAssetPreview.name} />
            <div className="hint">尺寸 {selectedAssetPreview.width}×{selectedAssetPreview.height}</div>
          </div>
        </div>
      )}
    </section>
  )
}
