import { DeskDeleteButton } from './DeskDeleteButton'
import { ParticipantPicker } from './ParticipantPicker'
import { PlaceFields, placeFromForm } from './PlaceFields'
import { StatusPill } from './Header'
import { EMR_WORK_LABEL, isEmrTask } from '../data/emr'
import { useOps } from '../store/OpsContext'
import type { Priority, TaskStatus } from '../types'
import { displayStatus, memberNames, taskStatusLabel } from '../utils/metrics'
import { addDays, formatDate, toDatetimeLocal } from '../utils/time'

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low']
const STATUSES: TaskStatus[] = ['not_started', 'in_progress', 'under_review', 'completed', 'overdue']

function defaultDue(): string {
  const date = addDays(new Date(), 0)
  date.setHours(17, 0, 0, 0)
  return toDatetimeLocal(date)
}

export function EmrDesk({ onSaved }: { onSaved: (message: string) => void }) {
  const { state, addTask, removeTask } = useOps()
  const lead = state.members.find((m) => m.role === 'Team Lead')?.id ?? state.members[0]?.id ?? ''
  const tasks = state.tasks.filter(isEmrTask)

  return (
    <>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const form = e.currentTarget
          const data = new FormData(form)
          const due = new Date(String(data.get('dueDate')))
          if (Number.isNaN(due.getTime())) return
          const selected = data.getAll('assignees').map(String).filter(Boolean)
          const assignedTo = selected.length ? selected : lead ? [lead] : []
          if (!assignedTo.length) return
          const status = String(data.get('status')) as TaskStatus
          const progress = status === 'completed' ? 100 : Number(data.get('progress') || 0)
          addTask({
            title: String(data.get('title')).trim(),
            description: String(data.get('description') || '').trim(),
            assignedTo,
            assignedBy: String(data.get('assignedBy') || lead),
            priority: String(data.get('priority')) as Priority,
            dueDate: due.toISOString(),
            status,
            progress,
            ...placeFromForm(data),
          })
          form.reset()
          onSaved('EMR Launch task saved. It now shows on the EMR Launch page.')
        }}
      >
        <p className="admin-help">
          Work entered here is tagged {EMR_WORK_LABEL} and appears under the countdown. It is not mixed into the
          rest of the hub list on that page.
        </p>
        <label>
          Title
          <input name="title" required placeholder="EMR Launch task" />
        </label>
        <label>
          Description
          <textarea name="description" rows={2} placeholder="What needs to happen" />
        </label>
        <ParticipantPicker
          members={state.members}
          name="assignees"
          legend="Assigned to"
          selectedIds={lead ? [lead] : []}
        />
        <label>
          Assigned by
          <select name="assignedBy" defaultValue={lead}>
            {state.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} ({member.role})
              </option>
            ))}
          </select>
        </label>
        <div className="admin-split">
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
          <label>
            Status
            <select name="status" defaultValue="not_started">
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {taskStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-split">
          <label>
            Due
            <input name="dueDate" type="datetime-local" required defaultValue={defaultDue()} />
          </label>
          <label>
            Progress %
            <input name="progress" type="number" min={0} max={100} defaultValue={0} />
          </label>
        </div>
        <PlaceFields workKind="other" workKindOther={EMR_WORK_LABEL} lockWorkKind />
        <button type="submit" className="primary-btn">
          Save EMR Launch task
        </button>
      </form>

      <section className="admin-live">
        <h3>EMR Launch tasks</h3>
        <div className="admin-list">
          {tasks.length === 0 && <p className="muted">No EMR Launch tasks yet.</p>}
          {tasks.map((task) => {
            const status = displayStatus(task)
            return (
              <div key={task.id} className="admin-item">
                <div className="admin-item-head">
                  <span>
                    {task.title}
                    <em className="muted">
                      {' '}
                      · {memberNames(state.members, task.assignedTo)} · Due {formatDate(task.dueDate)}
                    </em>
                  </span>
                  <DeskDeleteButton label={task.title} onDelete={() => removeTask(task.id)} />
                </div>
                <StatusPill status={status} />
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
