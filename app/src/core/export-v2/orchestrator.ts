import type { ExportExecutionResult, ExportTaskSpec } from './types'
import { runAnimationExport } from './engines/animationEngine'
import { runAtlasExport } from './engines/atlasEngine'
import { runGodotPackageExport } from './engines/godotPackageEngine'
import { runUiSliceExport } from './engines/uiSliceEngine'

export async function executeV2Export(task: ExportTaskSpec): Promise<ExportExecutionResult> {
  if (task.payload.template === 'atlas') return runAtlasExport(task)
  if (task.payload.template === 'animation') return runAnimationExport(task)
  if (task.payload.template === 'ui_slice') return runUiSliceExport(task)
  return runGodotPackageExport(task)
}
