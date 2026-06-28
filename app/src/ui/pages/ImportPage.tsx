import type { ChangeEvent } from 'react'
import { importImageFiles } from '../../core/services/imageImportService'
import { useWorkspace } from '../../core/state/useWorkspace'

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

export function ImportPage() {
  const { assets, activeAssetId, setAssets, setActiveAssetId, clearAssets } = useWorkspace()

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const nextAssets = await importImageFiles(files)
    if (nextAssets.length === 0) return

    setAssets((prev) => [...prev, ...nextAssets])
    setActiveAssetId(nextAssets[0].id)
    event.currentTarget.value = ''
  }

  return (
    <section className="card">
      <h2>素材导入</h2>
      <p>支持 PNG/JPG/WebP/BMP，多选导入并自动读取分辨率。</p>

      <div className="action-row">
        <label className="btn" htmlFor="file-input">
          选择图片
        </label>
        <input
          id="file-input"
          className="hidden-input"
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.bmp"
          multiple
          onChange={handleImport}
        />
        <button type="button" className="btn ghost" onClick={clearAssets}>
          清空列表
        </button>
        <span className="hint">当前共 {assets.length} 张</span>
      </div>

      <div className="asset-list">
        {assets.length === 0 ? (
          <div className="empty">还没有素材，先导入几张图试试。</div>
        ) : (
          assets.map((asset) => (
            <button
              type="button"
              key={asset.id}
              className={activeAssetId === asset.id ? 'asset-item active' : 'asset-item'}
              onClick={() => setActiveAssetId(asset.id)}
            >
              <img src={asset.objectUrl} alt={asset.name} />
              <div>
                <div className="asset-name">{asset.name}</div>
                <small>
                  {asset.width} × {asset.height} · {asset.format.toUpperCase()} · {formatSize(asset.size)}
                </small>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  )
}
