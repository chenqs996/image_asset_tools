import type { ImageAsset } from '../../../types/image'
import type { MattingResult } from '../../../types/matting'

export type ProcessTab = 'slice' | 'matting' | 'timeline'

export interface SlicePreviewItem {
  id: string
  index: number
  x: number
  y: number
  width: number
  height: number
  objectUrl: string
}

export interface InternalImportOption {
  id: string
  label: string
  assets: ImageAsset[]
}

export const TAB_ORDER: ProcessTab[] = ['slice', 'matting', 'timeline']

export const TAB_LABELS: Record<ProcessTab, string> = {
  slice: '切分',
  matting: '调整图片',
  timeline: '动画',
}

export function createEmptyTabAssets(): Record<ProcessTab, ImageAsset[]> {
  return {
    slice: [],
    matting: [],
    timeline: [],
  }
}

export function revokeAssetUrls(assets: ImageAsset[]) {
  assets.forEach((item) => URL.revokeObjectURL(item.objectUrl))
}

export function fileNameWithoutExt(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export async function cloneAssetForImport(asset: ImageAsset, nextName?: string): Promise<ImageAsset> {
  const response = await fetch(asset.objectUrl)
  const blob = await response.blob()
  const ext = asset.format === 'jpeg' ? 'jpg' : asset.format
  const fileName = nextName ?? asset.name
  const file = new File([blob], fileName.endsWith(`.${ext}`) ? fileName : `${fileName}.${ext}`, { type: blob.type || `image/${asset.format}` })
  return {
    id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    format: asset.format,
    width: asset.width,
    height: asset.height,
    size: blob.size,
    objectUrl: URL.createObjectURL(blob),
    file,
  }
}

export function toSlicePreviewAsset(item: SlicePreviewItem): ImageAsset {
  return {
    id: item.id,
    name: `slice_${item.index}.png`,
    format: 'png',
    width: item.width,
    height: item.height,
    size: 0,
    objectUrl: item.objectUrl,
    file: new File([], `slice_${item.index}.png`),
  }
}

export function toMattingResultAsset(asset: ImageAsset, result: MattingResult): ImageAsset {
  const resultName = asset.name.replace(/\.[^.]+$/, '') + '_matted.png'
  return {
    ...asset,
    name: resultName,
    format: 'png',
    objectUrl: result.outputUrl,
    size: 0,
    file: new File([], resultName),
  }
}

interface BuildInternalImportOptionsInput {
  activeTab: ProcessTab
  tabAssets: Record<ProcessTab, ImageAsset[]>
  slicePreviewItems: SlicePreviewItem[]
  mattingResults: Record<string, MattingResult>
  timelineAssets: ImageAsset[]
}

export function buildInternalImportOptions(input: BuildInternalImportOptionsInput): InternalImportOption[] {
  const sourceTabs = TAB_ORDER.filter((tab) => tab !== input.activeTab)
  const options: InternalImportOption[] = []

  for (const tab of sourceTabs) {
    options.push({
      id: `${tab}:original`,
      label: TAB_LABELS[tab],
      assets: input.tabAssets[tab],
    })

    let resultAssets: ImageAsset[] = []
    if (tab === 'slice') {
      resultAssets = input.slicePreviewItems.map(toSlicePreviewAsset)
    } else if (tab === 'matting') {
      resultAssets = input.tabAssets.matting
        .filter((asset) => Boolean(input.mattingResults[asset.id]))
        .map((asset) => toMattingResultAsset(asset, input.mattingResults[asset.id]))
    } else if (tab === 'timeline') {
      resultAssets = input.timelineAssets
    }

    options.push({
      id: `${tab}:result`,
      label: `${TAB_LABELS[tab]}处理结果`,
      assets: resultAssets,
    })
  }

  return options.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
}

interface BuildProcessedAssetsForTabInput {
  activeTab: ProcessTab
  tabAssets: Record<ProcessTab, ImageAsset[]>
  slicePreviewItems: SlicePreviewItem[]
  mattingResults: Record<string, MattingResult>
  timelineAssets: ImageAsset[]
}

export function buildProcessedAssetsForTab(input: BuildProcessedAssetsForTabInput): ImageAsset[] {
  if (input.activeTab === 'slice') {
    return input.slicePreviewItems.map(toSlicePreviewAsset)
  }

  if (input.activeTab === 'matting') {
    return input.tabAssets.matting
      .filter((asset) => Boolean(input.mattingResults[asset.id]))
      .map((asset) => toMattingResultAsset(asset, input.mattingResults[asset.id]))
  }

  if (input.activeTab === 'timeline') {
    return input.timelineAssets
  }

  return []
}