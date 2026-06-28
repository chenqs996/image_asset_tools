import { useMemo, useState } from 'react'
import type { TaskProgress } from '../../types/task'

export function useTaskStore() {
  const [tasks, setTasks] = useState<Record<string, TaskProgress>>({})

  const upsert = (task: TaskProgress) => {
    setTasks((prev) => ({ ...prev, [task.taskId]: task }))
  }

  const taskList = useMemo(() => Object.values(tasks), [tasks])

  return {
    tasks,
    taskList,
    upsert,
  }
}
