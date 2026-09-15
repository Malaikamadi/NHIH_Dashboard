import { useState } from 'react'
import { PlaceFields, PlaceLine, placeFromForm } from './PlaceFields'
import { HubLogPanel } from './HubLogPanel'
import { MeetingActions } from './MeetingActions'
import { MeetingForm } from './MeetingForm'
import { TaskActions } from './TaskActions'
import { useOps } from '../store/OpsContext'
import type { Priority, TaskStatus } from '../types'
import { meetingStatus, todaysMeetings } from '../utils/metrics'

interface Props {
  open: boolean
  onClose: () => void
  variant?: 'drawer' | 'page'
}

const STATUSES: TaskStatus[] = [
  'not_started',
  'in_progress',
  'under_review',
  'completed',
  'overdue',
]

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low']

export function AdminPanel({ open, onClose, variant = 'drawer' }: Props) {
  const { state, addTask, updateTask, addActionItem, convertActionToTask, resetDemo } =
    useOps()
  const lead = state.members.find((m) => m.role === 'Team Lead')?.id ?? 'm1'
  const [tab, setTab] = useState<'task' | 'meeting' | 'action' | 'log'>('task')
  const todayMeetings = todaysMeetings(state.meetings)

  if (!open) return null

  const body = (
      <aside className={`admin ${variant === 'page' ? 'is-page' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header className="admin-h">
          <div>
            <div className="hdr-kicker">Operator desk</div>
            <h2>Enter hub work</h2>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            {variant === 'page' ? 'View dashboard' : 'Close'}
          </button>
        </header>

        <p className="admin-help">
          This is the only place to add tasks, meetings, agenda, minutes, and the hub log. The
          dashboard stays view-only for the rest of the team.
        </p>

        <div className="admin-tabs">
          {(['task', 'meeting', 'action', 'log'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'is-active' : ''}
              onClick={() => setTab(id)}
            >
              {id === 'task'
                ? 'Assign task'
                : id === 'meeting'
                  ? 'Add meeting'
                  : id === 'action'
                    ? 'Action item'
                    : 'Hub log'}
            </button>
          ))}
        </div>

        {tab === 'task' && (
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault()
              const form = e.currentTarget
              const data = new FormData(form)
              addTask({
                title: String(data.get('title')),
                description: String(data.get('description')),
                assignedTo: String(data.get('assignedTo')),
                assignedBy: String(data.get('assignedBy')),
                priority: String(data.get('priority')) as Priority,
                dueDate: new Date(String(data.get('dueDate'))).toISOString(),
                status: String(data.get('status')) as TaskStatus,
                progress: Number(data.get('progress') || 0),
                ...placeFromForm(data),
              })
              form.reset()
            }}
          >
            <label>
              Title
              <input name="title" required placeholder="Task title" />
            </label>
            <label>
              Description
              <textarea name="description" rows={2} placeholder="What needs to happen" />
            </label>
            <div className="admin-split">
              <label>
                Assigned to
                <select name="assignedTo" required>
                  {state.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned by
                <select name="assignedBy" defaultValue={lead}>
                  {state.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-split">
              <label>
                Priority
                <select name="priority" defaultValue="high">
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select name="status" defaultValue="not_started">
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-split">
              <label>
                Due
                <input name="dueDate" type="datetime-local" required />
              </label>
              <label>
                Progress %
                <input name="progress" type="number" min={0} max={100} defaultValue={0} />
              </label>
            </div>
            <PlaceFields workKind="extract" />
            <button type="submit" className="primary-btn">
              Assign task
            </button>
          </form>
        )}

        {tab === 'meeting' && (
          <MeetingForm />
        )}

        {tab === 'meeting' && (
          <section className="admin-live">
            <h3>Today's meetings</h3>
            <div className="admin-list">
              {todayMeetings.length === 0 && (
                <p className="muted">No meetings on the board today.</p>
              )}
              {todayMeetings.map((meeting) => (
                <div key={meeting.id} className="admin-item admin-meeting">
                  <span>
                    {meeting.title}
                    <em className="muted"> · {meetingStatus(meeting)}</em>
                  </span>
                  <MeetingActions meeting={meeting} />
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'action' && (
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault()
              const form = e.currentTarget
              const data = new FormData(form)
              const meeting = state.meetings.find((m) => m.id === String(data.get('meetingId')))
              addActionItem({
                meetingId: meeting?.id ?? 'adhoc',
                meetingTitle: meeting?.title ?? 'Ad hoc',
                title: String(data.get('title')),
                assignedTo: String(data.get('assignedTo')),
                deadline: new Date(String(data.get('deadline'))).toISOString(),
                status: 'open',
                ...placeFromForm(data),
              })
              form.reset()
            }}
          >
            <label>
              Action point
              <input name="title" required placeholder="Follow up on..." />
            </label>
            <label>
              Meeting
              <select name="meetingId">
                {state.meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-split">
              <label>
                Owner
                <select name="assignedTo">
                  {state.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Deadline
                <input name="deadline" type="datetime-local" required />
              </label>
            </div>
            <PlaceFields />
            <button type="submit" className="primary-btn">
              Create action item
            </button>
          </form>
        )}

        {tab === 'log' && <HubLogPanel now={new Date()} allowInput />}

        <section className="admin-live">
          <h3>Open work</h3>
          <div className="admin-list">
            {state.tasks
              .filter((t) => t.status !== 'completed')
              .slice(0, 8)
              .map((task) => (
                <div key={task.id} className="admin-item">
                  <span>
                    {task.title}
                    <em className="muted">
                      {' '}
                      · <PlaceLine workKind={task.workKind} district={task.district} facility={task.facility} />
                    </em>
                  </span>
                  <div className="admin-item-tools">
                    <TaskActions task={task} />
                    <select
                      value={task.status}
                      onChange={(e) =>
                        updateTask(task.id, { status: e.target.value as TaskStatus })
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
          </div>
          <h3>Unconverted actions</h3>
          <div className="admin-list">
            {state.actionItems
              .filter((a) => !a.convertedToTaskId)
              .map((item) => (
                <div key={item.id} className="admin-item">
                  <span>{item.title}</span>
                  <button type="button" onClick={() => convertActionToTask(item.id, lead)}>
                    Convert
                  </button>
                </div>
              ))}
          </div>
        </section>

        <button type="button" className="ghost-btn danger-text" onClick={resetDemo}>
          Clear board
        </button>
      </aside>
  )

  if (variant === 'page') return body

  return (
    <div className="admin-scrim" onClick={onClose}>
      {body}
    </div>
  )
}
