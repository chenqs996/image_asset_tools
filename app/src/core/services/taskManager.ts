import type { TaskDefinition, TaskProgress } from '../../types/task'

type ProgressListener = (progress: TaskProgress) => void

export class TaskManager {
  private listeners = new Map<string, Set<ProgressListener>>()

  subscribe(taskId: string, listener: ProgressListener) {
    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, new Set())
    }
    this.listeners.get(taskId)!.add(listener)

    return () => this.listeners.get(taskId)?.delete(listener)
  }

  enqueue(task: TaskDefinition) {
    const progress: TaskProgress = {
      taskId: task.id,
      status: 'PENDING',
      progress: 0,
      message: `任务已入队：${task.type}`,
      startedAt: Date.now(),
    }

    this.emit(progress)
    return task.id
  }

  update(progress: TaskProgress) {
    this.emit(progress)
  }

  private emit(progress: TaskProgress) {
    const set = this.listeners.get(progress.taskId)
    if (!set) return
    for (const listener of set) {
      listener(progress)
    }
  }
}

export const taskManager = new TaskManager()
