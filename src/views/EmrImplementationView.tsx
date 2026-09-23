import { useMemo, useEffect, useState } from 'react'
import mohsLogo from '../assets/mohs-logo.jpg'
import { FlipValue } from '../components/FlipClock'
import { StatusPill } from '../components/Header'
import { EMR_GO_LIVE, emrRemaining, formatEmrGoLiveDate, isEmrTask, type EmrRemaining } from '../data/emr'
import { useOps } from '../store/OpsContext'
import type { Task, TaskStatus } from '../types'
import { displayStatus, memberNames } from '../utils/metrics'
import { formatDate } from '../utils/time'

const UNITS: { key: keyof EmrRemaining; label: string }[] = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' },
]

function unitValue(remaining: EmrRemaining, key: keyof EmrRemaining): string {
  const value = remaining[key]
  return key === 'days' ? String(value) : String(value).padStart(2, '0')
}

const STATUS_RANK: Record<TaskStatus, number> = {
  overdue: 0,
  in_progress: 1,
  under_review: 2,
  not_started: 3,
  completed: 4,
}

function EmrTasks({ now }: { now: Date }) {
  const { state } = useOps()
  const tasks = useMemo(() => {
    return state.tasks
      .filter(isEmrTask)
      .map((task) => ({ task, status: displayStatus(task, now) }))
      .sort((a, b) => {
        const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status]
        if (byStatus !== 0) return byStatus
        return +new Date(a.task.dueDate) - +new Date(b.task.dueDate)
      })
  }, [state.tasks, now])

  return (
    <section className="emr-tasks" aria-label="EMR Launch tasks">
      <header className="emr-tasks-head">
        <h3>EMR Launch tasks</h3>
        <p>Only EMR Launch work sits here, so the main board stays clear.</p>
      </header>
      {tasks.length === 0 ? (
        <p className="emr-tasks-empty">No EMR Launch tasks yet. Enter them on the operator desk.</p>
      ) : (
        <ul>
          {tasks.map(({ task, status }) => (
            <EmrTaskRow key={task.id} task={task} status={status} members={state.members} />
          ))}
        </ul>
      )}
    </section>
  )
}

function EmrTaskRow({
  task,
  status,
  members,
}: {
  task: Task
  status: TaskStatus
  members: { id: string; name: string; role: string; initials: string }[]
}) {
  return (
    <li className={`emr-task is-${status}`}>
      <div>
        <strong>{task.title}</strong>
        <span className="emr-task-meta">
          {memberNames(members, task.assignedTo)} · Due {formatDate(task.dueDate)}
        </span>
      </div>
      <StatusPill status={status} />
    </li>
  )
}

export function EmrImplementationView() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const remaining = emrRemaining(EMR_GO_LIVE, now)

  return (
    <div className="view emr-view">
      <div className="emr-orb emr-orb-a" aria-hidden="true" />
      <div className="emr-orb emr-orb-b" aria-hidden="true" />
      <div className="emr-orb emr-orb-c" aria-hidden="true" />

      <header className="emr-head">
        <img
          className="emr-logo"
          src={mohsLogo}
          alt="Ministry of Health, Government of Sierra Leone"
        />
        <h2>EMR Launch</h2>
        <p>Digitising care. Building a healthier future.</p>
      </header>

      <section className="emr-countdown" aria-label="EMR go-live countdown">
        <p className="emr-kicker">EMR Go-Live Countdown</p>
        <div className="emr-clock" role="timer">
          {UNITS.map((unit) => (
            <div className="emr-unit" key={unit.key} aria-label={`${remaining[unit.key]} ${unit.label}`}>
              <FlipValue value={unitValue(remaining, unit.key)} />
              <span className="emr-unit-label">{unit.label}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="emr-date">
        <span>Go-Live Date</span>
        <strong>{formatEmrGoLiveDate(EMR_GO_LIVE)}</strong>
      </p>

      <EmrTasks now={now} />
    </div>
  )
}
