import type { ExportTaskSpec } from './types'

export function validateV2TaskSpec(task: ExportTaskSpec): string[] {
  const issues: string[] = []

  if (!task.profileName.trim()) issues.push('导出配置名称不能为空')
  if (!task.outputFolder.trim()) issues.push('输出目录不能为空')
  if (task.assets.length === 0) issues.push('当前没有可导出的素材')

  if (task.payload.template === 'atlas') {
    const config = task.payload.config
    if (!config.autoSize && config.maxSize < 256) issues.push('图集尺寸过小，建议至少 256')
    if (!config.autoSize && config.maxSize > 8192) issues.push('图集尺寸过大，建议不超过 8192')
    if (config.padding < 0) issues.push('Padding 不能小于 0')
    if (config.extrude < 0) issues.push('Extrude 不能小于 0')
  }

  if (task.payload.template === 'animation') {
    const config = task.payload.config
    if (!config.exportSequence && !config.exportSpritesheet && !config.exportPlayerDesc) {
      issues.push('动画导出至少选择一种输出形态')
    }
    if (config.pivotMode === 'custom' && (!Number.isFinite(config.pivotX) || !Number.isFinite(config.pivotY))) {
      issues.push('自定义锚点坐标无效')
    }
  }

  if (task.payload.template === 'ui_slice') {
    const config = task.payload.config
    if (!config.enable9Slice && !config.enableMultiScale && !config.enableStateSplit) {
      issues.push('UI 专用切图至少启用一项能力')
    }
    if (config.enableMultiScale && config.scaleRatios.length === 0) {
      issues.push('多倍率导出至少配置一个倍率')
    }
    if (config.enableStateSplit && config.stateSuffixes.length === 0) {
      issues.push('状态图拆分需要提供后缀规则')
    }
  }

  return issues
}
