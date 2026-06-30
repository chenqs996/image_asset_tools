interface ProcessTransferActionsProps {
  onOpenImport: () => void
  onClear: () => void
  onOpenExport: () => void
}

export function ProcessTransferActions({ onOpenImport, onClear, onOpenExport }: ProcessTransferActionsProps) {
  return (
    <div className="action-row process-transfer-row process-transfer-row-split">
      <div className="process-transfer-left">
        <button type="button" className="btn ghost" onClick={onOpenImport}>导入</button>
        <button type="button" className="btn ghost" onClick={onClear}>清空</button>
      </div>
      <div className="process-transfer-right">
        <button type="button" className="btn ghost" onClick={onOpenExport}>导出</button>
      </div>
    </div>
  )
}
