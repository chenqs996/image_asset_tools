import type { ExportExecutionResult, ExportTaskSpec } from '../types'
import { sanitizeFileName, toJsonBlob } from './common'

async function copyAssetAsBlob(url: string) {
  const response = await fetch(url)
  return response.blob()
}

export async function runGodotPackageExport(task: ExportTaskSpec): Promise<ExportExecutionResult> {
  const config = task.payload.template === 'godot_package' ? task.payload.config : null
  if (!config) throw new Error('GODOT_CONFIG_MISSING')

  const warnings: string[] = []
  const artifacts: ExportExecutionResult['artifacts'] = []

  const textureRefs: Array<{ id: string; name: string; file: string; width: number; height: number }> = []

  for (const asset of task.assets) {
    try {
      const blob = await copyAssetAsBlob(asset.objectUrl)
      const safeName = sanitizeFileName(asset.name)
      const fileName = `${task.outputFolder}/textures/${safeName}`
      artifacts.push({
        fileName,
        mimeType: blob.type || 'application/octet-stream',
        blob,
        category: 'texture',
      })
      textureRefs.push({
        id: asset.id,
        name: asset.name,
        file: fileName,
        width: asset.width,
        height: asset.height,
      })
    } catch {
      warnings.push(`资源复制失败：${asset.name}`)
    }
  }

  artifacts.push({
    fileName: `${task.outputFolder}/metadata/godot_assets.json`,
    mimeType: 'application/json',
    blob: toJsonBlob({
      engine: 'godot',
      version: '4.x',
      format: config.metadataFormat,
      profileName: task.profileName,
      textures: textureRefs,
    }),
    category: 'metadata',
  })

  if (config.includeManifest) {
    artifacts.push({
      fileName: `${task.outputFolder}/manifest.json`,
      mimeType: 'application/json',
      blob: toJsonBlob({
        profileName: task.profileName,
        outputFolder: task.outputFolder,
        generatedAt: new Date().toISOString(),
        textureCount: textureRefs.length,
        warningCount: warnings.length,
      }),
      category: 'manifest',
    })
  }

  if (config.includeExportLog) {
    const log = [
      `[INFO] profile=${task.profileName}`,
      `[INFO] assets=${task.assets.length}`,
      `[INFO] textures_exported=${textureRefs.length}`,
      `[INFO] warnings=${warnings.length}`,
      ...warnings.map((item) => `[WARN] ${item}`),
    ].join('\n')
    artifacts.push({
      fileName: `${task.outputFolder}/export.log`,
      mimeType: 'text/plain',
      blob: new Blob([log], { type: 'text/plain' }),
      category: 'log',
    })
  }

  return {
    artifacts,
    warnings,
    summary: `Godot 资源包导出完成：纹理 ${textureRefs.length} 个，产物 ${artifacts.length} 个`,
  }
}
