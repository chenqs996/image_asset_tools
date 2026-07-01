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
  const latestTabAssetsRef = useRef<Record<ProcessTab, ImageAsset[]>>(createEmptyTabAssets())
  const latestSlicePreviewItemsRef = useRef<SlicePreviewItem[]>([])
  const latestResizePreviewAssetsRef = useRef<ImageAsset[]>([])
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
    currentFrame,
    reorderTimelineFrame,
    removeTimelineFrame,
  } = useTimelineWorkflow({
    timelineSourceAssets: tabAssets.timeline,
    fps: timeline.fps,
    loop: timeline.loop,
  })

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
    () => buildInternalImportOptions({ activeTab, tabAssets, sliceResultAssets, mattingResults, timelineAssets }),
    [activeTab, mattingResults, sliceResultAssets, tabAssets, timelineAssets],
  )

  const processedAssetsForActiveTab = useMemo<ImageAsset[]>(() => {
    return buildProcessedAssetsForTab({ activeTab, tabAssets, sliceResultAssets, mattingResults, timelineAssets })
  }, [activeTab, mattingResults, sliceResultAssets, tabAssets, timelineAssets])

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

            <div className="hint matting-status">{mattingStatus}</div>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="panel" style={{ marginTop: 14 }} role="tabpanel" aria-label="动画标签内容">
          <h3>帧动画时间线</h3>
          <div className="action-row">
            <button type="button" className="btn" onClick={() => setIsPlaying((prev) => !prev)} disabled={timelineAssets.length <= 1}>{isPlaying ? '暂停' : '播放'}</button>
            <label className="hint">FPS</label>
            <input className="input" type="number" min={1} max={60} value={timeline.fps} onChange={(e) => setTimelineFps(Number(e.target.value))} style={{ width: 100 }} />
            <button type="button" className={timeline.loop ? 'btn' : 'btn ghost'} onClick={toggleTimelineLoop}>循环：{timeline.loop ? '开' : '关'}</button>
            <span className="hint">总帧数：{timelineAssets.length}</span>
          </div>

          <div className="timeline-preview">
            {currentFrame ? (
              <>
                <img className="matting-img" src={currentFrame.objectUrl} alt={currentFrame.name} />
                <div className="hint">当前帧：{frameIndex + 1}/{timelineAssets.length} · {currentFrame.name}</div>
              </>
            ) : (
              <div className="empty">请先导入素材作为帧序列。</div>
            )}
          </div>

          <div className="timeline-list">
            {timelineAssets.map((asset, idx) => (
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
                <img src={asset.objectUrl} alt={asset.name} />
                <div>
                  <div className="asset-name">#{idx + 1} {asset.name}</div>
                  <small>{asset.width}×{asset.height}</small>
                </div>
                <button type="button" className="btn ghost" onClick={(event) => { event.stopPropagation(); removeTimelineFrame(asset.id) }}>
                  删除
                </button>
              </div>
            ))}
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
