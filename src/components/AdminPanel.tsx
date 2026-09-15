import { useEffect, useRef, useState } from 'react'
import { ActivityActions, ActivityForm } from './ActivityForm'
import { HubLogPanel } from './HubLogPanel'
import { MeetingActions } from './MeetingActions'
import { MeetingForm } from './MeetingForm'
import { PlaceFields, placeFromForm } from './PlaceFields'
import { TaskUpdatePanel } from './TaskUpdatePanel'
import { useOps } from '../store/OpsContext'
import type { Meeting, Priority, TaskStatus } from '../types'
import { meetingStatus, todaysActivities, todaysMeetings } from '../utils/metrics'

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
  const { state, addTask, addActionItem, convertActionToTask, resetDemo } =
    useOps()
  const lead = state.members.find((m) => m.role === 'Team Lead')?.id ?? 'm1'
  const [tab, setTab] = useState<'task' | 'update' | 'meeting' | 'activity' | 'action' | 'log'>('task')
  const [saved, setSaved] = useState('')
  const todayMeetings = todaysMeetings(state.meetings)
  const todayActivities = todaysActivities(state.activities)

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
          Assign new work here. Use Update tasks to change progress, status, and details. The
          dashboard stays view-only for the rest of the team.
        </p>
        {saved && <p className="meet-saved">{saved}</p>}

        <div className="admin-tabs">
          {(['task', 'update', 'meeting', 'activity', 'action', 'log'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'is-active' : ''}
              onClick={() => setTab(id)}
            >
              {id === 'task'
                ? 'Assign task'
                : id === 'update'
                  ? 'Update tasks'
                  : id === 'meeting'
                    ? 'Add meeting'
                    : id === 'activity'
                      ? 'Activity'
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
              const due = new Date(String(data.get('dueDate')))
              if (Number.isNaN(due.getTime())) return
              addTask({
                title: String(data.get('title')),
                description: String(data.get('description')),
                assignedTo: String(data.get('assignedTo')),
                assignedBy: String(data.get('assignedBy')),
                priority: String(data.get('priority')) as Priority,
                dueDate: due.toISOString(),
                status: String(data.get('status')) as TaskStatus,
                progress: Number(data.get('progress') || 0),
                ...placeFromForm(data),
              })
              form.reset()
              setSaved('Task saved. It now shows on the live dashboard.')
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

        {tab === 'update' && <TaskUpdatePanel />}

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

        {tab === 'activity' && <ActivityForm />}

        {tab === 'activity' && (
          <section className="admin-live">
            <h3>Today's activities</h3>
            <div className="admin-list">
              {todayActivities.length === 0 && (
                <p className="muted">No team activities on the board today.</p>
              )}
              {todayActivities.map((activity) => (
                <div key={activity.id} className="admin-item admin-meeting">
                  <span>
                    {activity.title}
                    <em className="muted"> · {meetingStatus(activity)}</em>
                  </span>
                  <ActivityActions activity={activity} />
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
              const meetingTitle = String(data.get('meetingTitle') || '').trim() || 'Ad hoc'
              const meeting = state.meetings.find(
                (item) => item.id === String(data.get('meetingId')) || item.title === meetingTitle,
              )
              addActionItem({
                meetingId: meeting?.id ?? 'adhoc',
                meetingTitle: meeting?.title ?? meetingTitle,
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
            <MeetingField meetings={state.meetings} />
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

        {tab === 'action' && (
        <section className="admin-live">
          <h3>Unconverted actions</h3>
          <div className="admin-list">
            {state.actionItems.filter((a) => !a.convertedToTaskId).length === 0 && (
              <p className="muted">No unconverted action items.</p>
            )}
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
        )}

        <button type="button" className="ghost-btn danger-text" onClick={resetDemo}>
          Clear hub data
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

function MeetingField({ meetings }: { meetings: Meeting[] }) {
  const [title, setTitle] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedId = meetings.find((meeting) => meeting.title === title)?.id ?? ''

  useEffect(() => {
    const form = rootRef.current?.closest('form')
    if (!form) return
    const onReset = () => setTitle('')
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [])

  return (
    <div ref={rootRef}>
      <label>
        Meeting
        <select
          name="meetingId"
          value={selectedId}
          onChange={(e) => {
            const meeting = meetings.find((item) => item.id === e.target.value)
            setTitle(meeting?.title ?? '')
          }}
        >
          <option value="">Select a meeting, or type the name below</option>
          {meetings.map((meeting) => (
            <option key={meeting.id} value={meeting.id}>
              {meeting.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Meeting name
        <input
          name="meetingTitle"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Daily Standup, DHIS2 review, or type another meeting"
        />
      </label>
    </div>
  )
}
