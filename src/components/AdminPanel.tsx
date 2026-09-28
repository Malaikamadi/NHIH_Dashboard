import { useEffect, useRef, useState } from 'react'
import { ActivityActions, ActivityForm } from './ActivityForm'
import { EmrDesk } from './EmrDesk'
import { DeskDeleteButton } from './DeskDeleteButton'
import { HubLogPanel } from './HubLogPanel'
import { MeetingActions } from './MeetingActions'
import { MeetingForm } from './MeetingForm'
import { ParticipantPicker } from './ParticipantPicker'
import { PlaceFields, placeFromForm } from './PlaceFields'
import { TaskUpdatePanel } from './TaskUpdatePanel'
import { WORK_TYPES } from '../data/catalog'
import { useOps } from '../store/OpsContext'
import { hubHasWork } from '../utils/hub'
import { readHubCache } from '../store/cache'
import type { ActionItem, ActionStatus, Meeting, Priority, TaskStatus } from '../types'
import { meetingStatus, memberWorkloads, recordedActivities, recordedMeetings, taskStatusLabel } from '../utils/metrics'
import { toDatetimeLocal } from '../utils/time'

function assigneesFromForm(data: FormData, fallback: string[] = []): string[] {
  const selected = data.getAll('assignees').map(String).filter(Boolean)
  return selected.length ? selected : fallback
}

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
  const { state, addTask, addActionItem, removeMeeting, removeActivity, resetDemo, restoreFromBrowser } =
    useOps()
  const lead = state.members.find((m) => m.role === 'Team Lead')?.id ?? 'm1'
  const [tab, setTab] = useState<'task' | 'update' | 'meeting' | 'activity' | 'action' | 'log' | 'emr'>('task')
  const [saved, setSaved] = useState('')
  const [saveError, setSaveError] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [taskSelection, setTaskSelection] = useState<string[]>(lead ? [lead] : [])
  const [taskDistricts, setTaskDistricts] = useState<string[]>(['national'])
  const [taskPriority, setTaskPriority] = useState<Priority>('high')
  const [taskWorkKind, setTaskWorkKind] = useState('extract')
  const [taskDue, setTaskDue] = useState('')
  const browserBackup = readHubCache()
  const hasBrowserBackup = hubHasWork(browserBackup)
  const todayMeetings = recordedMeetings(state.meetings)
  const weekActivities = recordedActivities(state.activities)
  const workloads = memberWorkloads(state)
  const selectedWorkloads = workloads.filter((row) => taskSelection.includes(row.member.id))
  const deskActions = [...state.actionItems].sort(
    (a, b) => +new Date(b.deadline) - +new Date(a.deadline),
  )

  if (!open) return null

  const body = (
      <aside className={`admin ${variant === 'page' ? 'is-page' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header className="admin-h">
          <div>
            <div className="hdr-kicker">Command workspace</div>
            <h2>Manage operational work</h2>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            {variant === 'page' ? 'View dashboard' : 'Close'}
          </button>
        </header>

        <p className="admin-help">
          Create and manage the operational data that powers the NHIH dashboard. Changes saved here\n          continue to populate the team-facing dashboard.
        </p>
        {saved && <p className="meet-saved">{saved}</p>}
        {saveError && <p className="warn-text" role="alert">{saveError}</p>}

        <div className="admin-tabs">
          {(['task', 'update', 'meeting', 'activity', 'action', 'log', 'emr'] as const).map((id) => (
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
                        : id === 'log'
                          ? 'Hub incident log'
                          : 'EMR Launch'}
            </button>
          ))}
        </div>

        {tab === 'task' && (
          <div className="desk-task-layout">
            <div className="desk-task-main">
              <div className="desk-task-title">
                <div className="desk-task-icon">▣</div>
                <div>
                  <h3>Assign Task</h3>
                  <p>Create and assign new work with clear ownership and timelines.</p>
                </div>
              </div>
              <form
                className="admin-form desk-command-form"
                onChange={(e) => {
                  const data = new FormData(e.currentTarget)
                  const selected = data.getAll('assignees').map(String).filter(Boolean)
                  setTaskSelection(selected.length ? selected : [])
                  const districts = data.getAll('districts').map(String).filter(Boolean)
                  setTaskDistricts(districts.length ? districts : ['national'])
                  setTaskPriority((String(data.get('priority') || 'high')) as Priority)
                  setTaskWorkKind(String(data.get('workKind') || 'extract'))
                  setTaskDue(String(data.get('dueDate') || ''))
                }}
                onSubmit={async (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const form = e.currentTarget
                  const data = new FormData(form)
                  const due = new Date(String(data.get('dueDate')))
                  if (Number.isNaN(due.getTime())) return
                  const assignedTo = assigneesFromForm(data, [lead])
                  if (!assignedTo.length) return
                  const status = String(data.get('status')) as TaskStatus
                  const progress = status === 'completed' ? 100 : Number(data.get('progress') || 0)
                  setSaved('')
                  setSaveError('')
                  try {
                    await addTask({
                    title: String(data.get('title')),
                    description: String(data.get('description')),
                    assignedTo,
                    assignedBy: String(data.get('assignedBy')),
                    priority: String(data.get('priority')) as Priority,
                    dueDate: due.toISOString(),
                    status,
                    progress,
                    ...placeFromForm(data),
                    })
                    form.reset()
                    setTaskSelection(lead ? [lead] : [])
                    setTaskDistricts(['national'])
                    setTaskPriority('high')
                    setTaskWorkKind('extract')
                    setTaskDue('')
                    setSaved('Task saved. It now shows on the live dashboard.')
                  } catch (error) {
                    setSaveError(`Task was not saved: ${error instanceof Error ? error.message : 'server unavailable'}. Please try again.`)
                  }
                }}
              >
                <section className="desk-step">
                  <div className="desk-step-head"><b>1</b><span><strong>Work details</strong><small>Define the task and key information</small></span></div>
                  <div className="desk-work-grid">
                    <label className="desk-title-field">Task title<input name="title" required placeholder="Enter a clear and concise task title..." /></label>
                    <label>Work type<select name="workKind" defaultValue="extract">{WORK_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                    {taskWorkKind === 'other' && <label>Other work type<input name="workKindOther" required placeholder="Describe the work type" /></label>}
                    <label>Priority<select name="priority" defaultValue="high">{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
                    <label className="desk-description-field">Description<textarea name="description" rows={3} maxLength={500} placeholder="What needs to happen? Include key details, expected outcome, or specific instructions..." /></label>
                    <label>Status<select name="status" defaultValue="not_started" onChange={(e) => { const progress=e.currentTarget.form?.elements.namedItem('progress'); if(e.currentTarget.value==='completed' && progress instanceof HTMLInputElement) progress.value='100' }}>{STATUSES.map((s) => <option key={s} value={s}>{taskStatusLabel(s)}</option>)}</select></label>
                    <label>Due date<input name="dueDate" type="datetime-local" required /></label>
                    <label>Target completion<input name="progress" type="number" min={0} max={100} defaultValue={0} /></label>
                  </div>
                </section>

                <section className="desk-step">
                  <div className="desk-step-head"><b>2</b><span><strong>Assign to team member(s)</strong><small>Search and select one or more team members</small></span></div>
                  <ParticipantPicker members={state.members} name="assignees" legend="Team members" selectedIds={lead ? [lead] : []} />
                  <label className="desk-assigned-by">Assigned by<select name="assignedBy" defaultValue={lead}>{state.members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}</select></label>
                </section>

                <section className="desk-step">
                  <div className="desk-step-head"><b>3</b><span><strong>Location (Districts)</strong><small>Select where this work applies</small></span></div>
                  <PlaceFields workKind="extract" omitWorkKind />
                </section>

                <div className="desk-submit-bar">
                  <span>{taskSelection.length} assignee{taskSelection.length === 1 ? '' : 's'} · {taskPriority} priority · {taskDistricts.length} district{taskDistricts.length === 1 ? '' : 's'}</span>
                  <button type="submit" className="primary-btn">Assign Task →</button>
                </div>
              </form>
            </div>

            <aside className="desk-context">
              <div className="desk-summary-card">
                <span className="desk-summary-icon">✓</span>
                <div><strong>Assignment summary</strong><b>Ready to assign</b><small>{taskSelection.length} team member{taskSelection.length === 1 ? '' : 's'} · {taskDistricts.length} district{taskDistricts.length === 1 ? '' : 's'} · {taskPriority} priority{taskDue ? ' · due selected' : ''}</small></div>
              </div>
              <h4>Selected team members</h4>
              <div className="desk-context-people">
                {selectedWorkloads.map((row) => (
                  <div className="desk-context-person" key={row.member.id}>
                    <span className="desk-person-avatar">{row.member.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</span>
                    <div className="desk-context-name"><strong>{row.member.name}</strong><small>{row.member.role}</small></div>
                    <div className={`desk-load ${row.overdue > 0 ? 'is-heavy' : ''}`}>{row.overdue > 0 ? 'Needs attention' : 'Normal load'}</div>
                    <div className="desk-context-stats"><span><b>{row.active}</b>Active</span><span><b>{row.overdue}</b>Overdue</span><span><b>{row.completed}</b>Completed</span></div>
                  </div>
                ))}
              </div>
              <h4>Selected districts</h4>
              <div className="desk-context-chips">{taskDistricts.map((d) => <span key={d}>⌖ {d === 'national' ? 'National / Hub' : d.replaceAll('_',' ')}</span>)}</div>
              {selectedWorkloads.some((row) => row.overdue > 0) && (
                <div className="desk-warning"><strong>Workload attention</strong><span>{selectedWorkloads.filter((row) => row.overdue > 0).length} selected team member(s) currently have overdue work. Review workload before assigning.</span></div>
              )}
              <div className="desk-related">
                <h4>Operational context</h4>
                <div><span>Open tasks</span><b>{state.tasks.filter((t) => t.status !== 'completed').length}</b></div>
                <div><span>Selected owners</span><b>{taskSelection.length}</b></div>
                <div><span>Selected districts</span><b>{taskDistricts.length}</b></div>
              </div>
            </aside>
          </div>
        )}

        {tab === 'update' && <TaskUpdatePanel />}

        {tab === 'emr' && <EmrDesk onSaved={setSaved} />}

        {tab === 'meeting' && (
          <MeetingForm />
        )}

        {tab === 'meeting' && (
          <section className="admin-live">
            <h3>Meetings on the hub</h3>
            <p className="admin-help">Each meeting is open to edit. Save changes to update the dashboard.</p>
            <div className="admin-list">
              {todayMeetings.length === 0 && (
                <p className="muted">No meetings on the board yet.</p>
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
            <h3>Activities on the hub</h3>
            <p className="admin-help">Edit title, type, time, place, people, and notes. Changes show on the dashboard.</p>
            <div className="admin-list">
              {weekActivities.length === 0 && (
                <p className="muted">No team activities on the board yet.</p>
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
              const assignedTo = assigneesFromForm(data, [lead])
              if (!assignedTo.length) return
              addActionItem({
                meetingId: meeting?.id ?? 'adhoc',
                meetingTitle: meeting?.title ?? meetingTitle,
                title: String(data.get('title')),
                assignedTo,
                deadline: new Date(String(data.get('deadline'))).toISOString(),
                status: 'open',
                ...placeFromForm(data),
              })
              form.reset()
              setSaved('Action saved and converted to a task on the board.')
            }}
          >
            <label>
              Action point
              <input name="title" required placeholder="Follow up on..." />
            </label>
            <MeetingField meetings={state.meetings} />
            <ParticipantPicker
              members={state.members}
              name="assignees"
              legend="Owners"
              selectedIds={lead ? [lead] : []}
            />
            <label>
              Deadline
              <input name="deadline" type="datetime-local" required />
            </label>
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
            <p className="admin-help">
              Each action is saved as a task automatically. Edit owners or details below if needed.
            </p>
            <div className="admin-list">
              {deskActions.length === 0 && <p className="muted">No action items yet.</p>}
              {deskActions.map((item) => (
                <ActionItemEdit key={item.id} item={item} meetings={state.meetings} />
              ))}
            </div>
          </section>
        )}

        <div className="meeting-composer-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="primary-btn sm"
            disabled={!hasBrowserBackup || restoring}
            onClick={async () => {
              setRestoring(true)
              const ok = await restoreFromBrowser()
              setRestoring(false)
              setSaved(
                ok
                  ? 'Restored hub work from this browser backup.'
                  : 'No browser backup found on this device.',
              )
            }}
          >
            {restoring ? 'Restoring…' : 'Restore from this browser'}
          </button>
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
        </div>
        {!hasBrowserBackup && (
          <p className="admin-help">
            No local backup in this browser. The full copy is still on Vercel Blob, but that store is
            inactive — reactivate billing for store <code>nhih-ops</code>, then we can pull it back.
          </p>
        )}
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
  meetings,
}: {
  item: ActionItem
  meetings: Meeting[]
}) {
  const { state, updateActionItem, convertActionToTask, removeActionItem } = useOps()
  const [saved, setSaved] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const lead = state.members.find((m) => m.role === 'Team Lead')?.id ?? state.members[0]?.id ?? 'm1'

  return (
    <div className="admin-item admin-meeting">
      <div className="admin-item-head">
        <span>
          {item.title}
          <em className="muted">
            {' '}
            · {item.status}
            {item.convertedToTaskId ? ' · on board as task' : ''}
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
          const assignedTo = assigneesFromForm(data, item.assignedTo)
          if (!assignedTo.length) return
          updateActionItem(item.id, {
            title: String(data.get('title')).trim(),
            meetingId: meeting?.id ?? item.meetingId,
            meetingTitle: meeting?.title ?? meetingTitle,
            assignedTo,
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
        <ParticipantPicker
          members={state.members}
          name="assignees"
          legend="Owners"
          selectedIds={item.assignedTo}
        />
        <label>
          Status
          <select name="status" defaultValue={item.status}>
            <option value="open">open</option>
            <option value="in_progress">in progress</option>
            <option value="completed">completed</option>
          </select>
        </label>
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
