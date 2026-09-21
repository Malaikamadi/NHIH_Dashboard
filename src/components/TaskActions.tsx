import { useEffect, useState } from 'react'
import { useOps } from '../store/OpsContext'
import type { Task } from '../types'
import { displayStatus } from '../utils/metrics'

export function TaskActions({ task }: { task: Task }) {
  const { updateTask } = useOps()
  const [draft, setDraft] = useState(task.progress)
  const status = displayStatus(task)

  useEffect(() => {
    setDraft(task.progress)
  }, [task.progress])

  if (status === 'completed') {
    return <span className="muted">Completed</span>
  }

  const saveProgress = (value: number) => {
    const progress = Math.min(100, Math.max(0, Math.round(value)))
    setDraft(progress)
    if (progress >= 100) {
      if (task.status !== 'completed') {
        updateTask(task.id, { status: 'completed', progress: 100 })
      }
      return
    }
    const nextStatus =
      task.status === 'not_started' || task.status === 'overdue' ? 'in_progress' : task.status
    if (progress === task.progress && nextStatus === task.status) return
    updateTask(task.id, { progress, status: nextStatus })
  }

  const commitFromInput = (el: HTMLInputElement) => saveProgress(Number(el.value))

  return (
    <div className="task-actions">
      <label className="progress-edit">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={draft}
          aria-label={`Progress for ${task.title}`}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={(e) => commitFromInput(e.currentTarget)}
          onKeyUp={(e) => commitFromInput(e.currentTarget)}
        />
        <span>{draft}%</span>
      </label>
      <button
        type="button"
        className="complete-btn"
        onClick={() => updateTask(task.id, { status: 'completed', progress: 100 })}
      >
        Complete
      </button>
    </div>
  )
}
