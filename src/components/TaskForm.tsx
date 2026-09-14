import { PlaceFields, placeFromForm } from './PlaceFields'
import { useOps } from '../store/OpsContext'
import type { Priority } from '../types'
import { addDays, toDatetimeLocal } from '../utils/time'

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low']

function defaultDue(): string {
  const date = addDays(new Date(), 0)
  date.setHours(17, 0, 0, 0)
  return toDatetimeLocal(date)
}

export function TaskForm({
  onAdded,
  onCancel,
}: {
  onAdded?: () => void
  onCancel?: () => void
}) {
  const { state, addTask } = useOps()
  const lead = state.members.find((m) => m.role === 'Team Lead')?.id ?? state.members[0]?.id ?? ''

  return (
    <form
      className="meeting-composer"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        addTask({
          title: String(data.get('title')).trim(),
          description: String(data.get('description') || '').trim(),
          assignedTo: String(data.get('assignedTo')),
          assignedBy: lead,
          priority: String(data.get('priority')) as Priority,
          dueDate: new Date(String(data.get('dueDate'))).toISOString(),
          status: 'not_started',
          progress: 0,
          ...placeFromForm(data),
        })
        form.reset()
        onAdded?.()
      }}
    >
      <label>
        Task title
        <input name="title" required placeholder="What needs to get done" />
      </label>
      <label>
        Notes
        <textarea name="description" rows={2} placeholder="Optional detail" />
      </label>
      <div className="admin-split">
        <label>
          Assigned to
          <select name="assignedTo" required defaultValue={lead}>
            {state.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select name="priority" defaultValue="high">
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Due
        <input name="dueDate" type="datetime-local" required defaultValue={defaultDue()} />
      </label>
      <PlaceFields workKind="extract" />
      <div className="meeting-composer-actions">
        <button type="submit" className="primary-btn sm">
          Add task
        </button>
        {onCancel && (
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
