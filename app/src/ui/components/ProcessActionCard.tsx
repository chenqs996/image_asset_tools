import type { ReactNode } from 'react'

interface ProcessActionCardProps {
  title: string
  actions: ReactNode
  config: ReactNode
  density?: 'normal' | 'compact'
}

export function ProcessActionCard({
  title,
  actions,
  config,
  density = 'normal',
}: ProcessActionCardProps) {
  return (
    <section className={density === 'compact' ? 'process-action-card compact' : 'process-action-card'}>
      <div className="process-action-card-head">
        <span className="process-action-card-title">{title}</span>
      </div>
      <div className="process-action-card-body">
        <div className="process-action-card-zone process-action-card-actions-zone">
          <div className="process-action-card-actions">{actions}</div>
        </div>
        <div className="process-action-card-zone process-action-card-config-zone">
          <div className="process-action-card-config">{config}</div>
        </div>
      </div>
    </section>
  )
}
