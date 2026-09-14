import { displayStatus, memberById, memberName } from '../utils/metrics'
import { formatDue, formatTimeRange } from '../utils/time'
import { Avatar, PriorityMark, StatusPill } from './Header'
import type { Meeting, MeetingStatus, Task, TeamMember } from '../types'

export function MetricCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent'
}) {
  return (
    <article className={`metric tone-${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {hint && <div className="metric-hint">{hint}</div>}
    </article>
  )
}

export function MeetingRow({
  meeting,
  members,
  status,
  featured,
}: {
  meeting: Meeting
  members: TeamMember[]
  status: MeetingStatus
  featured?: boolean
}) {
  const people = meeting.participantIds
    .map((id) => memberById(members, id))
    .filter((m): m is TeamMember => Boolean(m))

  return (
    <article className={`meeting ${featured ? 'is-featured' : ''} is-${status}`}>
      <div className="meeting-time">
        <div className="meeting-range">{formatTimeRange(meeting.startTime, meeting.endTime)}</div>
        <StatusPill status={status} />
      </div>
      <div className="meeting-body">
        <h3>{meeting.title}</h3>
        <div className="meeting-people">
          <div className="avatar-row">
            {people.slice(0, 6).map((p, i) => (
              <Avatar key={p.id} name={p.name} initials={p.initials} index={members.findIndex((m) => m.id === p.id) || i} />
            ))}
          </div>
          <span className="muted">
            {people.length} {people.length === 1 ? 'participant' : 'participants'}
            {people.length <= 4 ? ` · ${people.map((p) => p.name.split(' ')[0]).join(', ')}` : ''}
          </span>
        </div>
      </div>

    </article>
  )
}

export function TaskRow({
  task,
  members,
  now,
}: {
  task: Task
  members: TeamMember[]
  now: Date
}) {
  const owner = memberById(members, task.assignedTo)
  const status = displayStatus(task, now)
  const idx = members.findIndex((m) => m.id === task.assignedTo)

  return (
    <article className={`task-row is-${status}`}>
      <div className="task-main">
        <h3>{task.title}</h3>
        <div className="task-meta">
          {owner && <Avatar name={owner.name} initials={owner.initials} index={Math.max(idx, 0)} />}
          <span>{memberName(members, task.assignedTo)}</span>
          <span className="dot" />
          <span>{formatDue(task.dueDate, now)}</span>
        </div>
      </div>
      <div className="task-side">
        <PriorityMark priority={task.priority} />
        <StatusPill status={status} />
        <div className="mini-bar">
          <span style={{ width: `${task.progress}%` }} />
        </div>
        <div className="mini-bar-label">{task.progress}%</div>
      </div>
    </article>
  )
}

export function RingChart({ value, label }: { value: number; label: string }) {
  const r = 72
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(Math.max(value, 0), 100) / 100)
  return (
    <div className="ring">
      <svg viewBox="0 0 180 180" className="ring-svg">
        <circle cx="90" cy="90" r={r} className="ring-track" />
        <circle
          cx="90"
          cy="90"
          r={r}
          className="ring-value"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 90 90)"
        />
      </svg>
      <div className="ring-copy">
        <strong>{value}%</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

export function WeekBars({
  series,
}: {
  series: { label: string; count: number }[]
}) {
  const max = Math.max(...series.map((s) => s.count), 1)
  return (
    <div className="weekbars">
      {series.map((s, i) => (
        <div key={`${s.label}-${i}`} className={`weekbar ${i === series.length - 1 ? 'is-today' : ''}`}>
          <div className="weekbar-col">
            <div className="weekbar-fill" style={{ height: `${(s.count / max) * 100}%` }} />
          </div>
          <div className="weekbar-count">{s.count}</div>
          <div className="weekbar-label">{s.label}</div>
        </div>
      ))}
    </div>
  )
}
