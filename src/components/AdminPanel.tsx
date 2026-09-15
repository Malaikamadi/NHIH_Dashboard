import { useEffect, useRef, useState } from 'react'
import { ActivityActions, ActivityForm } from './ActivityForm'
import { DeskDeleteButton } from './DeskDeleteButton'
import { HubLogPanel } from './HubLogPanel'
import { MeetingActions } from './MeetingActions'
import { MeetingForm } from './MeetingForm'
import { PlaceFields, placeFromForm } from './PlaceFields'
import { TaskUpdatePanel } from './TaskUpdatePanel'
import { useOps } from '../store/OpsContext'
import type { ActionItem, ActionStatus, Meeting, Priority, TaskStatus } from '../types'
import { meetingStatus, taskStatusLabel, weeksActivities, weeksMeetings } from '../utils/metrics'
import { toDatetimeLocal } from '../utils/time'

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
  const { state, addTask, addActionItem, removeMeeting, removeActivity, resetDemo } = useOps()
  const lead = state.members.find((m) => m.role === 'Team Lead')?.id ?? 'm1'
  const [tab, setTab] = useState<'task' | 'update' | 'meeting' | 'activity' | 'action' | 'log'>('task')
  const [saved, setSaved] = useState('')
  const todayMeetings = weeksMeetings(state.meetings)
  const weekActivities = weeksActivities(state.activities)
  const deskActions = [...state.actionItems].sort(
    (a, b) => +new Date(b.deadline) - +new Date(a.deadline),
  )

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
                        : 'Hub incident log'}
            </button>
          ))}
        </div>

        {tab === 'task' && (
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
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
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned by
                <select name="assignedBy" defaultValue={lead}>
                  {state.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role})
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
                      {taskStatusLabel(s)}
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
            <h3>This week's meetings</h3>
            <p className="admin-help">Each meeting is open to edit. Save changes to update the dashboard.</p>
            <div className="admin-list">
              {todayMeetings.length === 0 && (
                <p className="muted">No meetings on the board this week.</p>
              )}
              {todayMeetings.map((meeting) => (
                <div key={meeting.id} className="admin-item admin-meeting">
                  <div className="admin-item-head">
                    <span>
                      {meeting.title}
                      <em className="muted"> · {meetingStatus(meeting)}</em>
                    </span>
                    <DeskDeleteButton label={meeting.title} onDelete={() => removeMeeting(meeting.id)} />
                  </div>
                  <MeetingActions meeting={meeting} />
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'activity' && <ActivityForm />}

        {tab === 'activity' && (
          <section className="admin-live">
            <h3>This week's activities</h3>
            <p className="admin-help">Edit title, type, time, place, people, and notes. Changes show on the dashboard.</p>
            <div className="admin-list">
              {weekActivities.length === 0 && (
                <p className="muted">No team activities on the board this week.</p>
              )}
              {weekActivities.map((activity) => (
                <div key={activity.id} className="admin-item admin-meeting">
                  <div className="admin-item-head">
                    <span>
                      {activity.title}
                      <em className="muted"> · {meetingStatus(activity)}</em>
                    </span>
                    <DeskDeleteButton label={activity.title} onDelete={() => removeActivity(activity.id)} />
                  </div>
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
              e.stopPropagation()
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
                      {m.name} ({m.role})
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
            <h3>Action items</h3>
            <p className="admin-help">Each posted action is open to edit. Convert it when it should become a task.</p>
            <div className="admin-list">
              {deskActions.length === 0 && <p className="muted">No action items yet.</p>}
              {deskActions.map((item) => (
                <ActionItemEdit key={item.id} item={item} lead={lead} meetings={state.meetings} />
              ))}
            </div>
          </section>
        )}

        <button
          type="button"
          className="ghost-btn danger-text"
          onClick={() => {
            if (
              window.confirm(
                'Clear all hub tasks, meetings, activities, actions, and incident log? This cannot be undone.',
              )
            ) {
              resetDemo()
            }
          }}
        >
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

function MeetingField({ meetings, defaultTitle = '' }: { meetings: Meeting[]; defaultTitle?: string }) {
  const [title, setTitle] = useState(defaultTitle)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedId = meetings.find((meeting) => meeting.title === title)?.id ?? ''

  useEffect(() => {
    setTitle(defaultTitle)
  }, [defaultTitle])

  useEffect(() => {
    const form = rootRef.current?.closest('form')
    if (!form) return
    const onReset = () => setTitle(defaultTitle)
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [defaultTitle])

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

function ActionItemEdit({
  item,
  lead,
  meetings,
}: {
  item: ActionItem
  lead: string
  meetings: Meeting[]
}) {
  const { state, updateActionItem, convertActionToTask, removeActionItem } = useOps()
  const [saved, setSaved] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <div className="admin-item admin-meeting">
      <div className="admin-item-head">
        <span>
          {item.title}
          <em className="muted">
            {' '}
            · {item.status}
            {item.convertedToTaskId ? ' · converted' : ''}
          </em>
        </span>
        <DeskDeleteButton label={item.title} onDelete={() => removeActionItem(item.id)} />
      </div>
      <form
        id={`edit-action-${item.id}`}
        ref={formRef}
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const data = new FormData(e.currentTarget)
          const meetingTitle = String(data.get('meetingTitle') || '').trim() || 'Ad hoc'
          const meeting = meetings.find(
            (entry) => entry.id === String(data.get('meetingId')) || entry.title === meetingTitle,
          )
          const deadline = new Date(String(data.get('deadline')))
          if (Number.isNaN(deadline.getTime())) return
          updateActionItem(item.id, {
            title: String(data.get('title')).trim(),
            meetingId: meeting?.id ?? item.meetingId,
            meetingTitle: meeting?.title ?? meetingTitle,
            assignedTo: String(data.get('assignedTo')),
            deadline: deadline.toISOString(),
            status: String(data.get('status')) as ActionStatus,
            ...placeFromForm(data),
          })
          setSaved(true)
          window.setTimeout(() => setSaved(false), 2000)
        }}
      >
        <label>
          Action point
          <input name="title" required defaultValue={item.title} />
        </label>
        <MeetingField meetings={meetings} defaultTitle={item.meetingTitle} />
        <div className="admin-split">
          <label>
            Owner
            <select name="assignedTo" defaultValue={item.assignedTo}>
              {state.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({member.role})
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={item.status}>
              <option value="open">open</option>
              <option value="in_progress">in progress</option>
              <option value="completed">completed</option>
            </select>
          </label>
        </div>
        <label>
          Deadline
          <input
            name="deadline"
            type="datetime-local"
            required
            defaultValue={toDatetimeLocal(new Date(item.deadline))}
          />
        </label>
        <PlaceFields
          workKind={item.workKind}
          workKindOther={item.workKindOther}
          district={item.district}
          facility={item.facility ?? ''}
        />
        <div className="meeting-composer-actions">
          <button type="button" className="primary-btn sm" onClick={() => formRef.current?.requestSubmit()}>
            Save action
          </button>
          {!item.convertedToTaskId && (
            <button type="button" className="ghost-btn" onClick={() => convertActionToTask(item.id, lead)}>
              Convert to task
            </button>
          )}
        </div>
        {saved && <p className="meet-saved">Action saved to the dashboard.</p>}
      </form>
    </div>
  )
}
