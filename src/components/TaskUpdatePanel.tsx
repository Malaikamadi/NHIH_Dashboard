import { useMemo, useState } from 'react'
import { PlaceFields, PlaceLine, placeFromForm } from './PlaceFields'
import { StatusPill } from './Header'
import { TaskActions } from './TaskActions'
import { useOps } from '../store/OpsContext'
import type { Priority, Task, TaskStatus } from '../types'
import { displayStatus, memberName } from '../utils/metrics'
import { formatDue, toDatetimeLocal } from '../utils/time'

const STATUSES: TaskStatus[] = [
  'not_started',
  'in_progress',
  'under_review',
  'completed',
  'overdue',
]

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low']

export function TaskUpdatePanel() {
  const { state } = useOps()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const now = useMemo(() => new Date(), [state.tasks])

  const tasks = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...state.tasks]
      .filter((task) => {
        const status = displayStatus(task, now)
        if (filter === 'open' && status === 'completed') return false
        if (!q) return true
        const owner = memberName(state.members, task.assignedTo).toLowerCase()
        return (
          task.title.toLowerCase().includes(q) ||
          task.description.toLowerCase().includes(q) ||
          owner.includes(q)
        )
      })
      .sort((a, b) => {
        const aDone = displayStatus(a, now) === 'completed' ? 1 : 0
        const bDone = displayStatus(b, now) === 'completed' ? 1 : 0
        if (aDone !== bDone) return aDone - bDone
        return +new Date(a.dueDate) - +new Date(b.dueDate)
      })
  }, [state.tasks, state.members, query, filter, now])

  const openCount = state.tasks.filter((task) => displayStatus(task, now) !== 'completed').length

  return (
    <section className="task-update">
      <p className="admin-help">
        Update progress, status, due date, owner, and the rest. Changes show on the dashboard.
      </p>
      <div className="task-update-tools">
        <div className="admin-tabs compact">
          <button type="button" className={filter === 'open' ? 'is-active' : ''} onClick={() => setFilter('open')}>
            Open ({openCount})
          </button>
          <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>
            All ({state.tasks.length})
          </button>
        </div>
        <label className="search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" />
        </label>
      </div>
      {tasks.length === 0 && <p className="muted">No tasks to update yet. Assign one first.</p>}
      <div className="task-update-list">
        {tasks.map((task) => (
          <TaskUpdateCard
            key={task.id}
            task={task}
            now={now}
            editing={!collapsed[task.id]}
            onToggle={() =>
              setCollapsed((current) => ({ ...current, [task.id]: !current[task.id] }))
            }
          />
        ))}
      </div>
    </section>
  )
}

function TaskUpdateCard({
  task,
  now,
  editing,
  onToggle,
}: {
  task: Task
  now: Date
  editing: boolean
  onToggle: () => void
}) {
  const { state, updateTask } = useOps()
  const [saved, setSaved] = useState(false)
  const status = displayStatus(task, now)

  return (
    <article className="task-update-card">
      <header className="task-update-top">
        <div>
          <strong>{task.title}</strong>
          <PlaceLine
            workKind={task.workKind}
            workKindOther={task.workKindOther}
            district={task.district}
            facility={task.facility}
          />
          <p className="muted">
            {memberName(state.members, task.assignedTo)} · {formatDue(task.dueDate, now)}
          </p>
        </div>
        <StatusPill status={status} />
      </header>

      <div className="task-update-progress">
        <TaskActions task={task} />
        <select
          value={task.status}
          aria-label={`Status for ${task.title}`}
          onChange={(e) => updateTask(task.id, { status: e.target.value as TaskStatus })}
        >
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {item.replace('_', ' ')}
            </option>
          ))}
        </select>
        <button type="button" className={`tool-btn ${editing ? 'is-on' : ''}`} onClick={onToggle}>
          {editing ? 'Close' : 'Edit details'}
        </button>
      </div>

      {editing && (
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault()
            const data = new FormData(e.currentTarget)
            const due = new Date(String(data.get('dueDate')))
            if (Number.isNaN(due.getTime())) return
            const progress = Number(data.get('progress') || task.progress)
            const nextStatus = String(data.get('status')) as TaskStatus
            updateTask(task.id, {
              title: String(data.get('title')).trim(),
              description: String(data.get('description') || '').trim(),
              assignedTo: String(data.get('assignedTo')),
              assignedBy: String(data.get('assignedBy')),
              priority: String(data.get('priority')) as Priority,
              dueDate: due.toISOString(),
              status: nextStatus,
              progress: Math.min(100, Math.max(0, Math.round(progress))),
              ...placeFromForm(data),
            })
            setSaved(true)
            window.setTimeout(() => setSaved(false), 2000)
          }}
        >
          <label>
            Title
            <input name="title" required defaultValue={task.title} />
          </label>
          <label>
            Update / notes
            <textarea
              name="description"
              rows={3}
              defaultValue={task.description}
              placeholder="What changed, blocker, next step…"
            />
          </label>
          <div className="admin-split">
            <label>
              Assigned to
              <select name="assignedTo" defaultValue={task.assignedTo}>
                {state.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.role})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assigned by
              <select name="assignedBy" defaultValue={task.assignedBy}>
                {state.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.role})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="admin-split">
            <label>
              Priority
              <select name="priority" defaultValue={task.priority}>
                {PRIORITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={task.status}>
                {STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {item.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="admin-split">
            <label>
              Due
              <input name="dueDate" type="datetime-local" required defaultValue={toDatetimeLocal(new Date(task.dueDate))} />
            </label>
            <label>
              Progress %
              <input name="progress" type="number" min={0} max={100} defaultValue={task.progress} />
            </label>
          </div>
          <PlaceFields
            workKind={task.workKind}
            workKindOther={task.workKindOther}
            district={task.district}
            facility={task.facility ?? ''}
          />
          <button type="submit" className="primary-btn">
            Save updates
          </button>
          {saved && <p className="meet-saved">Updates saved to the dashboard.</p>}
        </form>
      )}
    </article>
  )
}
