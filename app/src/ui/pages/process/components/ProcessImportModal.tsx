import type { ChangeEvent } from 'react'
import type { InternalImportOption } from '../processDomain'

interface ProcessImportModalProps {
  show: boolean
  showInternalImportList: boolean
  internalImportOptions: InternalImportOption[]
  onToggleInternalImportList: () => void
  onImportFiles: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  onImportFromInternal: (optionId: string) => Promise<void>
  onClose: () => void
}

export function ProcessImportModal({
  show,
  showInternalImportList,
  internalImportOptions,
  onToggleInternalImportList,
  onImportFiles,
  onImportFromInternal,
  onClose,
}: ProcessImportModalProps) {
  if (!show) return null

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="导入素材">
      <div className="modal-card">
        <h3>导入素材</h3>
        <p className="hint">支持 PNG/JPG/WebP/BMP，多选导入。</p>
        <div className="action-row">
          <label className="btn" htmlFor="process-file-input">选择图片</label>
          <button type="button" className="btn ghost" onClick={onToggleInternalImportList}>从内部导入</button>
          <input id="process-file-input" className="hidden-input" type="file" accept=".png,.jpg,.jpeg,.webp,.bmp" multiple onChange={onImportFiles} />
          <button type="button" className="btn ghost" onClick={onClose}>关闭</button>
        </div>

        {showInternalImportList && (
          <div className="internal-import-list">
            {internalImportOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className="btn ghost internal-import-option"
                disabled={option.assets.length === 0}
                onClick={() => {
                  void onImportFromInternal(option.id)
                }}
              >
                <span>{option.label}</span>
                <span className="hint">{option.assets.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
