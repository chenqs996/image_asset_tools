import type { ExportExecutionResult, ExportTaskSpec } from '../types'
import { canvasToPngBlob, loadAssetImage, parseNumberList, sanitizeFileName, toJsonBlob } from './common'

interface ParsedState {
  base: string
  state: string
}

function parseStateFromName(name: string, suffixes: string[]): ParsedState | null {
  const lowerName = name.toLowerCase()
  for (const suffix of suffixes) {
    const lowerSuffix = suffix.toLowerCase()
    if (lowerName.includes(lowerSuffix)) {
      return {
        base: name.slice(0, Math.max(0, lowerName.indexOf(lowerSuffix))).replace(/[_.-]+$/, ''),
        state: suffix.replace(/^_/, ''),
      }
    }
  }
  return null
}

export async function runUiSliceExport(task: ExportTaskSpec): Promise<ExportExecutionResult> {
  const config = task.payload.template === 'ui_slice' ? task.payload.config : null
  if (!config) throw new Error('UI_SLICE_CONFIG_MISSING')

  const warnings: string[] = []
  const artifacts: ExportExecutionResult['artifacts'] = []

  if (config.enableMultiScale) {
    const ratios = config.scaleRatios.length > 0 ? config.scaleRatios : parseNumberList('1,1.5,2')
    for (const asset of task.assets) {
      const image = await loadAssetImage(asset)
      for (const ratio of ratios) {
        if (!Number.isFinite(ratio) || ratio <= 0) continue
        const w = Math.max(1, Math.floor(image.naturalWidth * ratio))
        const h = Math.max(1, Math.floor(image.naturalHeight * ratio))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          warnings.push(`多倍率导出失败：${asset.name} @${ratio}x`)
          continue
        }
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(image, 0, 0, w, h)
        artifacts.push({
          fileName: `${task.outputFolder}/textures/ui_scale/${sanitizeFileName(asset.name.replace(/\.[^.]+$/, ''))}@${ratio}x.png`,
          mimeType: 'image/png',
          blob: await canvasToPngBlob(canvas),
          category: 'texture',
        })
      }
    }
  }

  const stateMap: Record<string, Record<string, string>> = {}
  if (config.enableStateSplit) {
    for (const asset of task.assets) {
      const parsed = parseStateFromName(asset.name, config.stateSuffixes)
      if (!parsed) {
        warnings.push(`状态识别失败：${asset.name}`)
        continue
      }
      const baseKey = parsed.base || asset.name.replace(/\.[^.]+$/, '')
      stateMap[baseKey] ??= {}
      stateMap[baseKey][parsed.state] = asset.name
    }
  }

  artifacts.push({
    fileName: `${task.outputFolder}/metadata/ui_slice.json`,
    mimeType: 'application/json',
    blob: toJsonBlob({
      profileName: task.profileName,
      features: {
        nineSlice: config.enable9Slice,
        multiScale: config.enableMultiScale,
        stateSplit: config.enableStateSplit,
      },
      nineSlice: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        note: '当前交互版使用默认 margin，后续支持可视化编辑',
      },
      multiScale: {
        ratios: config.scaleRatios,
      },
      states: stateMap,
    }),
    category: 'metadata',
  })

  return {
    artifacts,
    warnings,
    summary: `UI 导出完成：素材 ${task.assets.length} 张，产物 ${artifacts.length} 个`,
  }
}
