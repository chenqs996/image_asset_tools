import { useMemo, useState } from 'react'
import { useWorkspace } from '../../core/state/useWorkspace'
import { exportAssetsByRule, triggerDownloads, type ExportFormat } from '../../utils/exportUtils'

function fileNameWithoutExt(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export function ExportPage() {
  const { assets } = useWorkspace()
  const [prefix, setPrefix] = useState(() => (assets[0] ? fileNameWithoutExt(assets[0].name) : 'asset'))
  const [startIndex, setStartIndex] = useState(1)
  const [digits, setDigits] = useState(3)
  const [suffix, setSuffix] = useState('')
  const [format, setFormat] = useState<ExportFormat>('PNG')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [status, setStatus] = useState('')

  const selectedAssets = useMemo(() => {
    const selected = assets.filter((item) => selectedIds.includes(item.id))
    return selected.length > 0 ? selected : assets
  }, [assets, selectedIds])

  const toggleSelect = (assetId: string) => {
    setSelectedIds((prev) => (prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]))
  }

  const runBatchExport = async () => {
    if (selectedAssets.length === 0) {
      setStatus('没有可导出的素材')
      return
    }
    setStatus(`正在生成 ${selectedAssets.length} 个导出文件...`)
    const downloads = await exportAssetsByRule(selectedAssets, {
      prefix,
      startIndex,
      digits,
      suffix,
      format,
    })
    triggerDownloads(downloads, {
      zipFileName: `${prefix || '素材'}-批量.zip`,
    })
    setStatus(`已触发下载：${downloads.length} 个文件`)
  }

  return (
    <section className="card">
      <h2>批量导出</h2>
      <p>命名规则：前缀 + 序号，支持冲突策略（自动重命名/覆盖/跳过）。</p>
      <div className="hint">当前可导出素材：{assets.length} 张</div>

      <div className="panel" style={{ marginTop: 12 }}>
        <h3>命名与格式</h3>
        <div className="field-grid two-col">
          <label>文件名前缀</label>
          <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          <label>起始序号</label>
          <input className="input" type="number" value={startIndex} onChange={(e) => setStartIndex(Math.max(0, Number(e.target.value) || 0))} />
          <label>序号位数</label>
          <input className="input" type="number" value={digits} onChange={(e) => setDigits(Math.max(1, Number(e.target.value) || 1))} />
          <label>文件名后缀</label>
          <input className="input" value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="可选，如 bg" />
          <label>导出格式</label>
          <select className="input" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="PNG">PNG</option>
            <option value="BMP">BMP</option>
            <option value="WebP">WebP</option>
          </select>
        </div>

        <div className="action-row">
          <button type="button" className="btn" onClick={runBatchExport}>批量导出所选素材</button>
          <span className="hint">多文件会自动打包为 ZIP，一次下载。</span>
          <span className="hint">{status}</span>
        </div>
      </div>

      <div className="asset-list" style={{ marginTop: 12 }}>
        {assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className={selectedIds.includes(asset.id) ? 'asset-item active' : 'asset-item'}
            onClick={() => toggleSelect(asset.id)}
          >
            <img src={asset.objectUrl} alt={asset.name} />
            <div>
              <div className="asset-name">{asset.name}</div>
              <small>
                {asset.width} × {asset.height} · {asset.format.toUpperCase()}
              </small>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
