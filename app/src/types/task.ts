export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED'

export interface TaskProgress {
  taskId: string
  status: TaskStatus
  progress: number
  message?: string
  startedAt?: number
  endedAt?: number
}

export interface TaskDefinition<TConfig = unknown> {
  id: string
  type: 'slice' | 'scale' | 'matting' | 'export' | 'timeline'
  config: TConfig
}
