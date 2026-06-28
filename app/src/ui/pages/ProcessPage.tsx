import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { importImageFiles } from '../../core/services/imageImportService'
import { configService, type AppConfig } from '../../core/services/configService'
import { runMatting } from '../../core/services/mattingService'
import { providerRegistry } from '../../core/services/providerRegistry'
import { useWorkspace } from '../../core/state/useWorkspace'
import { platformBridge } from '../../platform/platformBridge'
import { DEFAULT_MATTING_CONFIG, type MattingConfig, type MattingResult } from '../../types/matting'
import { DEFAULT_SLICE_CONFIG } from '../../types/slice'
import type { ImageAsset } from '../../types/image'
import { exportAssetsByRule, triggerDownloads, type ExportFormat } from '../../utils/exportUtils'
import { generateSliceRects } from '../../utils/sliceGrid'
import { detectSplitLinesFromUrl } from '../../utils/lineDetect'
import { buildScalePreview } from '../../utils/scalePreview'
import { HorizontalImageScroller, type HorizontalImageScrollerItem } from '../components/HorizontalImageScroller'

type ProcessTab = 'slice' | 'scale' | 'matting' | 'timeline'

interface SlicePreviewItem {
  id: string
  index: number
  x: number
  y: number
  width: number
  height: number
  objectUrl: string
}

const TAB_ORDER: ProcessTab[] = ['slice', 'scale', 'matting', 'timeline']

export function ProcessPage() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [providers, setProviders] = useState<string[]>([])
  const [lineTool, setLineTool] = useState<'x' | 'y'>('x')
  const [detecting, setDetecting] = useState(false)
  const [draggingLine, setDraggingLine] = useState<{ axis: 'x' | 'y'; line: number } | null>(null)
  const [mattingConfig, setMattingConfig] = useState<MattingConfig>(DEFAULT_MATTING_CONFIG)
  const [mattingResults, setMattingResults] = useState<Record<string, MattingResult>>({})
  const [mattingOverrides, setMattingOverrides] = useState<Record<string, Partial<MattingConfig>>>({})
  const [mattingStatus, setMattingStatus] = useState('')
  const [processingBatch, setProcessingBatch] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [frameIndex, setFrameIndex] = useState(0)
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<ProcessTab>('slice')
  const [selectedAssetsByTab, setSelectedAssetsByTab] = useState<Record<ProcessTab, string | null>>({
    slice: null,
    scale: null,
    matting: null,
    timeline: null,
  })
  const [slicePreviewVisible, setSlicePreviewVisible] = useState(true)
  const [slicePreviewItems, setSlicePreviewItems] = useState<SlicePreviewItem[]>([])
  const [slicePreviewStatus, setSlicePreviewStatus] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [prefix, setPrefix] = useState('asset')
  const [startIndex, setStartIndex] = useState(1)
  const [digits, setDigits] = useState(3)
  const [suffix, setSuffix] = useState('')
  const [format, setFormat] = useState<ExportFormat>('PNG')
  const [exportScope, setExportScope] = useState<'all' | 'active' | 'slice_preview'>('all')
  const [exportStatus, setExportStatus] = useState('')
  const [selectedExportPreviewId, setSelectedExportPreviewId] = useState<string | null>(null)
  const [exportPreviewLightbox, setExportPreviewLightbox] = useState<{
    imageUrl: string
    title: string
    meta: string
  } | null>(null)
  const [selectedSlicePreview, setSelectedSlicePreview] = useState<SlicePreviewItem | null>(null)
  const [selectedAssetPreview, setSelectedAssetPreview] = useState<ImageAsset | null>(null)
  const [previewRenderSize, setPreviewRenderSize] = useState({ width: 0, height: 0 })

  const previewImageRef = useRef<HTMLImageElement | null>(null)
  const tabRefs = useRef<Record<ProcessTab, HTMLButtonElement | null>>({
    slice: null,
    scale: null,
    matting: null,
    timeline: null,
  })

  const {
    assets,
    sliceConfig,
    setSliceConfig,
    scaleConfig,
    setScaleConfig,
    timeline,
    setTimelineFps,
    toggleTimelineLoop,
    reorderTimelineFrame,
    removeTimelineFrame,
    setAssets,
    clearAssets,
  } = useWorkspace()

  const platform = platformBridge.getPlatformInfo()

  useEffect(() => {
    if (assets.length === 0) {
      setSelectedAssetsByTab({ slice: null, scale: null, matting: null, timeline: null })
      return
    }

    setSelectedAssetsByTab((prev) => {
      const firstId = assets[0].id
      const next: Record<ProcessTab, string | null> = { ...prev }
      for (const tab of TAB_ORDER) {
        const current = prev[tab]
        next[tab] = current && assets.some((asset) => asset.id === current) ? current : firstId
      }
      return next
    })
  }, [assets])

  const getAssetByTab = (tab: ProcessTab) => {
    const id = selectedAssetsByTab[tab]
    return assets.find((item) => item.id === id) ?? null
  }

  const sliceAsset = getAssetByTab('slice')
  const scaleAsset = getAssetByTab('scale')
  const mattingAsset = getAssetByTab('matting')
  const activeAsset = getAssetByTab(activeTab)

  const assetScrollerItems = useMemo<HorizontalImageScrollerItem[]>(
    () =>
      assets.map((asset) => ({
        id: asset.id,
        imageUrl: asset.objectUrl,
        title: asset.name,
        metaLines: [`${asset.width}×${asset.height}`],
      })),
    [assets],
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

  const scalePreview = useMemo(() => {
    if (!scaleAsset) return []
    return buildScalePreview(scaleAsset.width, scaleAsset.height, scaleConfig)
  }, [scaleAsset, scaleConfig])

  const timelineAssets = useMemo(
    () => timeline.frameIds.map((id) => assets.find((item) => item.id === id)).filter(Boolean),
    [timeline.frameIds, assets],
  )
  const currentFrame = timelineAssets.length > 0 ? timelineAssets[frameIndex % timelineAssets.length] : null

  const exportTargets = useMemo(() => {
    if (exportScope === 'active') return activeAsset ? [activeAsset] : []
    if (exportScope === 'slice_preview') {
      return slicePreviewItems.map((item) => ({
        id: item.id,
        name: `slice_${item.index}.png`,
        format: 'png' as const,
        width: item.width,
        height: item.height,
        size: 0,
        objectUrl: item.objectUrl,
        file: new File([], `slice_${item.index}.png`),
      })) as ImageAsset[]
    }
    return assets
  }, [assets, activeAsset, exportScope, slicePreviewItems])

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
      exportTargets.map((item) => ({
        id: item.id,
        imageUrl: item.objectUrl,
        title: item.name,
        metaLines: [`${item.width}×${item.height}`, `${item.format.toUpperCase()}`],
      })),
    [exportTargets],
  )

  const selectedSliceIndex = useMemo(() => {
    if (!selectedSlicePreview) return -1
    return slicePreviewItems.findIndex((item) => item.id === selectedSlicePreview.id)
  }, [selectedSlicePreview, slicePreviewItems])

  useEffect(() => {
    configService.load().then(setConfig)
    providerRegistry.loadRuntimePlugins().finally(() => {
      setProviders(providerRegistry.listManifests().map((item) => item.displayName))
    })
    return () => {
      Object.values(mattingResults).forEach((item) => URL.revokeObjectURL(item.outputUrl))
      slicePreviewItems.forEach((item) => URL.revokeObjectURL(item.objectUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isPlaying || timelineAssets.length <= 1) return
    const interval = window.setInterval(() => {
      setFrameIndex((prev) => {
        const next = prev + 1
        if (next < timelineAssets.length) return next
        return timeline.loop ? 0 : prev
      })
    }, Math.max(16, Math.floor(1000 / Math.max(1, timeline.fps))))
    return () => window.clearInterval(interval)
  }, [isPlaying, timelineAssets.length, timeline.fps, timeline.loop])

  useEffect(() => {
    if (frameIndex >= timelineAssets.length) {
      setFrameIndex(0)
    }
  }, [frameIndex, timelineAssets.length])

  useEffect(() => {
    if (activeTab !== 'slice') {
      setExportScope((prev) => (prev === 'slice_preview' ? 'all' : prev))
    }
  }, [activeTab])

  useEffect(() => {
    if (!showExportModal) return
    if (exportTargets.length === 0) {
      setSelectedExportPreviewId(null)
      return
    }
    const exists = selectedExportPreviewId && exportTargets.some((item) => item.id === selectedExportPreviewId)
    if (!exists) {
      setSelectedExportPreviewId(exportTargets[0].id)
    }
  }, [showExportModal, exportTargets, selectedExportPreviewId])

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

  const updateScaleNumber = (key: 'targetWidth' | 'targetHeight', value: string) => {
    const parsed = Number(value)
    setScaleConfig((prev) => ({ ...prev, [key]: Number.isFinite(parsed) ? parsed : 1 }))
  }

  const updateMattingNumber = (key: 'threshold' | 'smooth' | 'denoise' | 'feather', value: string) => {
    const parsed = Number(value)
    setMattingConfig((prev) => ({ ...prev, [key]: Number.isFinite(parsed) ? parsed : 0 }))
  }

  const mergedConfigForAsset = (assetId: string): MattingConfig => ({
    ...mattingConfig,
    ...(mattingOverrides[assetId] ?? {}),
  })

  const setMattingResult = (result: MattingResult) => {
    setMattingResults((prev) => {
      const old = prev[result.assetId]
      if (old) URL.revokeObjectURL(old.outputUrl)
      return { ...prev, [result.assetId]: result }
    })
  }

  const handleSingleMatting = async () => {
    if (!mattingAsset) return
    setMattingStatus(`处理中：${mattingAsset.name}`)
    const result = await runMatting(mattingAsset, mergedConfigForAsset(mattingAsset.id))
    setMattingResult(result)
    setMattingStatus(result.warning ?? '单图预览完成')
  }

  const handleBatchMatting = async () => {
    if (assets.length === 0) return
    setProcessingBatch(true)
    let finished = 0
    for (const asset of assets) {
      setMattingStatus(`批量处理中 ${finished + 1}/${assets.length}：${asset.name}`)
      const result = await runMatting(asset, mergedConfigForAsset(asset.id))
      setMattingResult(result)
      finished += 1
    }
    setProcessingBatch(false)
    setMattingStatus('批量抠图完成')
  }

  const applyOverrideForActive = async () => {
    if (!mattingAsset) return
    setMattingOverrides((prev) => ({ ...prev, [mattingAsset.id]: { ...mattingConfig } }))
    const result = await runMatting(mattingAsset, mattingConfig)
    setMattingResult(result)
    setMattingStatus(`已为 ${mattingAsset.name} 应用例外参数并重跑`)
  }

  const revokeSlicePreviewItems = (items: SlicePreviewItem[]) => {
    items.forEach((item) => URL.revokeObjectURL(item.objectUrl))
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

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    const nextAssets = await importImageFiles(files)
    if (nextAssets.length === 0) return
    setAssets((prev) => [...prev, ...nextAssets])
    setShowImportModal(false)
    event.currentTarget.value = ''
  }

  const runExport = async () => {
    if (exportTargets.length === 0) {
      setExportStatus('没有可导出的内容')
      return
    }

    setExportStatus(`正在生成 ${exportTargets.length} 个导出文件...`)
    const downloads = await exportAssetsByRule(exportTargets, { prefix, startIndex, digits, suffix, format })
    triggerDownloads(downloads)
    setExportStatus(`已触发下载：${downloads.length} 个文件`)
    setShowExportModal(false)
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

  const renderImportExportActions = () => (
    <div className="action-row process-transfer-row">
      <button type="button" className="btn ghost" onClick={() => setShowImportModal(true)}>导入</button>
      <button type="button" className="btn ghost" onClick={() => setShowExportModal(true)}>导出</button>
      <span className="hint">导入/导出参数通过弹窗设置</span>
    </div>
  )

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
      <h2>处理面板</h2>
      <p>每个处理标签页都有独立素材选择，不共享选中状态。</p>

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
            {tab === 'slice' ? '切分' : tab === 'scale' ? '缩放' : tab === 'matting' ? '抠图' : '动画'}
          </button>
        ))}
      </div>

      <div className="panel asset-picker-panel">
        <HorizontalImageScroller
          title="素材选择"
          items={assetScrollerItems}
          selectedId={selectedAssetsByTab[activeTab]}
          onSelect={(id) => setSelectedAssetForTab(activeTab, id)}
          onZoom={(id) => {
            const target = assets.find((item) => item.id === id)
            if (target) setSelectedAssetPreview(target)
          }}
          emptyText="暂无素材，请先导入"
        />
      </div>

      {activeTab === 'slice' && (
        <div className="split-grid" role="tabpanel" aria-label="切分标签内容">
          <div className="panel">
            <h3>切分参数</h3>
            {renderImportExportActions()}
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

      {activeTab === 'scale' && (
        <div className="panel" role="tabpanel" aria-label="缩放标签内容">
          <h3>缩放预览（仅缩小）</h3>
          {renderImportExportActions()}
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
          <div className="hint">放大会被标记为禁止（downscale only）。</div>
          <div className="line-badges" style={{ marginTop: 10 }}>
            {scalePreview.length === 0 && <span className="hint">请先选择素材。</span>}
            {scalePreview.map((item) => (
              <span key={`${item.label}-${item.width}-${item.height}`} className={item.blocked ? 'scale-chip blocked' : 'scale-chip'}>
                {item.label} → {item.width}×{item.height} {item.blocked ? '(禁止放大)' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'matting' && (
        <div className="panel" style={{ marginTop: 14 }} role="tabpanel" aria-label="抠图标签内容">
          <h3>抠图处理</h3>
          {renderImportExportActions()}
          <div className="field-grid two-col">
            <label>算法</label>
            <select className="input" value={mattingConfig.algorithm} onChange={(e) => setMattingConfig((prev) => ({ ...prev, algorithm: e.target.value as MattingConfig['algorithm'] }))}>
              <option value="ai_general">AI通用（ONNX Runtime）</option>
              <option value="chroma_key">纯色色键</option>
              <option value="checkerboard">灰白方格专用</option>
            </select>
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
            <label>自动去除外边框线条</label>
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={mattingConfig.removeOuterBorder}
                onChange={(e) =>
                  setMattingConfig((prev) => ({
                    ...prev,
                    removeOuterBorder: e.target.checked,
                  }))
                }
              />
              先检测并去除外边框（四边可独立存在）
            </label>
            <label>背景色（色键）</label>
            <input className="input" type="color" value={mattingConfig.bgColorHex} onChange={(e) => setMattingConfig((prev) => ({ ...prev, bgColorHex: e.target.value }))} />
            <label>ONNX 模型路径</label>
            <input className="input" value={mattingConfig.modelPath} onChange={(e) => setMattingConfig((prev) => ({ ...prev, modelPath: e.target.value }))} />
          </div>

          <div className="action-row">
            <button type="button" className="btn" onClick={handleSingleMatting} disabled={!mattingAsset || processingBatch}>单图预览</button>
            <button type="button" className="btn" onClick={handleBatchMatting} disabled={assets.length === 0 || processingBatch}>{processingBatch ? '批量处理中...' : '批量抠图'}</button>
            <button type="button" className="btn ghost" onClick={applyOverrideForActive} disabled={!mattingAsset || processingBatch}>当前图设为例外参数并重跑</button>
            <span className="hint">{mattingStatus}</span>
          </div>

          {mattingAsset && (
            <div className="matting-compare">
              <div>
                <h4>原图</h4>
                <img className="matting-img" src={mattingAsset.objectUrl} alt={`${mattingAsset.name}-origin`} />
              </div>
              <div>
                <h4>抠图结果</h4>
                {mattingResults[mattingAsset.id] ? <img className="matting-img" src={mattingResults[mattingAsset.id].outputUrl} alt={`${mattingAsset.name}-matted`} /> : <div className="empty">尚未生成抠图结果</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="panel" style={{ marginTop: 14 }} role="tabpanel" aria-label="动画标签内容">
          <h3>帧动画时间线</h3>
          {renderImportExportActions()}
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
                <img src={asset!.objectUrl} alt={asset!.name} />
                <div>
                  <div className="asset-name">#{idx + 1} {asset!.name}</div>
                  <small>{asset!.width}×{asset!.height}</small>
                </div>
                <button type="button" className="btn ghost" onClick={(event) => { event.stopPropagation(); removeTimelineFrame(asset!.id) }}>
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="kv-grid">
        <div>默认输出格式</div>
        <strong>{config?.defaultOutputFormat ?? '-'}</strong>
        <div>默认并发</div>
        <strong>{config?.concurrency ?? '-'}</strong>
        <div>当前平台</div>
        <strong>{platform.os}</strong>
        <div>已注册算法</div>
        <strong>{providers.length > 0 ? providers.join('、') : '暂无'}</strong>
      </div>

      {showImportModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="导入素材">
          <div className="modal-card">
            <h3>导入素材</h3>
            <p className="hint">支持 PNG/JPG/WebP/BMP，多选导入。</p>
            <div className="action-row">
              <label className="btn" htmlFor="process-file-input">选择图片</label>
              <input id="process-file-input" className="hidden-input" type="file" accept=".png,.jpg,.jpeg,.webp,.bmp" multiple onChange={handleImport} />
              <button type="button" className="btn ghost" onClick={clearAssets}>清空素材</button>
              <button type="button" className="btn ghost" onClick={() => setShowImportModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="导出参数">
          <div className="modal-card export-modal-card">
            <h3>导出参数</h3>
            <div className="field-grid two-col">
              <label>导出范围</label>
              <select className="input" value={exportScope} onChange={(e) => setExportScope(e.target.value as 'all' | 'active' | 'slice_preview')}>
                <option value="all">全部素材</option>
                <option value="active">当前素材</option>
                {activeTab === 'slice' && <option value="slice_preview">切分预览结果</option>}
              </select>
              <label>文件名前缀</label>
              <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
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

            <div className="slice-list" style={{ marginTop: 12 }}>
              <HorizontalImageScroller
                title="导出预览"
                items={exportPreviewItems}
                selectedId={selectedExportPreviewId}
                onSelect={(id) => setSelectedExportPreviewId(id)}
                onZoom={(id) => {
                  const target = exportTargets.find((item) => item.id === id)
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
              <button type="button" className="btn" onClick={runExport}>确认导出</button>
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
