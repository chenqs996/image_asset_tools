import type { ExportExecutionResult, ExportTaskSpec } from '../types'
import { canvasToPngBlob, fileNameWithoutExt, loadAssetImage, sanitizeFileName, toJsonBlob } from './common'

export async function runAnimationExport(task: ExportTaskSpec): Promise<ExportExecutionResult> {
  const config = task.payload.template === 'animation' ? task.payload.config : null
  if (!config) throw new Error('ANIMATION_CONFIG_MISSING')

  const warnings: string[] = []
  const artifacts: ExportExecutionResult['artifacts'] = []
  const images = await Promise.all(task.assets.map(async (asset) => ({ asset, image: await loadAssetImage(asset) })))

  if (config.exportSequence) {
    for (let i = 0; i < images.length; i += 1) {
      const { asset, image } = images[i]
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        warnings.push(`序列导出失败：${asset.name}`)
        continue
      }
      ctx.drawImage(image, 0, 0)
      const frameNo = String(i + 1).padStart(4, '0')
      artifacts.push({
        fileName: `${task.outputFolder}/textures/sequence/${sanitizeFileName(fileNameWithoutExt(asset.name))}_${frameNo}.png`,
        mimeType: 'image/png',
        blob: await canvasToPngBlob(canvas),
        category: 'texture',
      })
    }

    artifacts.push({
      fileName: `${task.outputFolder}/metadata/animation_sequence.json`,
      mimeType: 'application/json',
      blob: toJsonBlob({
        profileName: task.profileName,
        fps: config.fps,
        loop: config.loop,
        frameCount: images.length,
      }),
      category: 'metadata',
    })
  }

  if (config.exportSpritesheet && images.length > 0) {
    const maxW = Math.max(...images.map((item) => item.image.naturalWidth))
    const maxH = Math.max(...images.map((item) => item.image.naturalHeight))
    const cols = Math.max(1, Math.ceil(Math.sqrt(images.length)))
    const rows = Math.ceil(images.length / cols)

    const canvas = document.createElement('canvas')
    canvas.width = cols * maxW
    canvas.height = rows * maxH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('SPRITESHEET_CONTEXT_FAILED')

    const frames: Array<{ id: string; x: number; y: number; w: number; h: number }> = []
    images.forEach(({ asset, image }, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const x = col * maxW
      const y = row * maxH
      ctx.drawImage(image, x, y, image.naturalWidth, image.naturalHeight)
      frames.push({ id: asset.id, x, y, w: image.naturalWidth, h: image.naturalHeight })
    })

    artifacts.push({
      fileName: `${task.outputFolder}/textures/animation_spritesheet.png`,
      mimeType: 'image/png',
      blob: await canvasToPngBlob(canvas),
      category: 'texture',
    })
    artifacts.push({
      fileName: `${task.outputFolder}/metadata/animation_spritesheet.json`,
      mimeType: 'application/json',
      blob: toJsonBlob({ cols, rows, cellWidth: maxW, cellHeight: maxH, frames }),
      category: 'metadata',
    })
  }

  if (config.exportPlayerDesc) {
    artifacts.push({
      fileName: `${task.outputFolder}/metadata/godot_animation_player.json`,
      mimeType: 'application/json',
      blob: toJsonBlob({
        animation: {
          name: task.profileName,
          fps: config.fps,
          loop: config.loop,
          pivotMode: config.pivotMode,
          pivotUnit: config.pivotUnit,
          pivot: { x: config.pivotX, y: config.pivotY },
          frameIds: task.assets.map((item) => item.id),
        },
      }),
      category: 'metadata',
    })
  }

  return {
    artifacts,
    warnings,
    summary: `动画导出完成：${task.assets.length} 帧，产物 ${artifacts.length} 个`,
  }
}
