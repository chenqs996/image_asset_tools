import type { ImageAsset } from '../../types/image'

export type ExportScope = 'all' | 'selected'
export type V2ExportTemplate = 'atlas' | 'animation' | 'ui_slice' | 'godot_package'

export interface ExportProfileBase {
  profileName: string
  outputFolder: string
  scope: ExportScope
}

export interface AtlasExportConfig {
  autoSize: boolean
  maxSize: number
  padding: number
  extrude: number
  policy: 'balanced' | 'min_pages' | 'min_waste'
  powerOfTwo: boolean
  allowRotate: boolean
}

export interface AnimationExportConfig {
  exportSequence: boolean
  exportSpritesheet: boolean
  exportPlayerDesc: boolean
  pivotMode: 'center' | 'bottom_center' | 'custom'
  pivotUnit: 'normalized' | 'pixel'
  pivotX: number
  pivotY: number
  fps: number
  loop: boolean
}

export interface UiSliceExportConfig {
  enable9Slice: boolean
  enableMultiScale: boolean
  enableStateSplit: boolean
  scaleRatios: number[]
  stateSuffixes: string[]
}

export interface GodotPackageExportConfig {
  metadataFormat: 'json'
  includeManifest: boolean
  includeExportLog: boolean
}

export type ExportPayload =
  | { template: 'atlas'; config: AtlasExportConfig }
  | { template: 'animation'; config: AnimationExportConfig }
  | { template: 'ui_slice'; config: UiSliceExportConfig }
  | { template: 'godot_package'; config: GodotPackageExportConfig }

export interface ExportTaskSpec extends ExportProfileBase {
  payload: ExportPayload
  assets: ImageAsset[]
}

export interface ExportArtifact {
  fileName: string
  mimeType: string
  blob: Blob
  category: 'texture' | 'metadata' | 'manifest' | 'log'
}

export interface ExportExecutionResult {
  artifacts: ExportArtifact[]
  warnings: string[]
  summary: string
}
