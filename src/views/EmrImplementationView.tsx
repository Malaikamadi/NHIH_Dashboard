import { useMemo, useEffect, useState } from 'react'
import mohsLogo from '../assets/mohs-logo.jpg'
import { FlipValue } from '../components/FlipClock'
import {
  EMR_GO_LIVE,
  EMR_PHASES,
  emrPhaseOf,
  emrRemaining,
  formatEmrGoLiveDate,
  isEmrTask,
  type EmrPhaseId,
  type EmrRemaining,
} from '../data/emr'
import { useOps } from '../store/OpsContext'
import type { Task, TaskStatus } from '../types'
import { displayStatus } from '../utils/metrics'

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
  const byPhase = useMemo(() => {
    const groups = new Map<EmrPhaseId, { task: Task; status: TaskStatus }[]>()
    for (const phase of EMR_PHASES) groups.set(phase.id, [])
    for (const task of state.tasks) {
      if (!isEmrTask(task)) continue
      const status = displayStatus(task, now)
      groups.get(emrPhaseOf(task))?.push({ task, status })
    }
    for (const items of groups.values()) {
      items.sort((a, b) => {
        const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status]
        if (byStatus !== 0) return byStatus
        return +new Date(a.task.dueDate) - +new Date(b.task.dueDate)
      })
    }
    return groups
  }, [state.tasks, now])

  const currentId = useMemo(() => {
    const open = EMR_PHASES.find((phase) =>
      (byPhase.get(phase.id) ?? []).some((item) => item.status !== 'completed'),
    )
    if (open) return open.id
    const withWork = [...EMR_PHASES].reverse().find((phase) => (byPhase.get(phase.id) ?? []).length > 0)
    return withWork?.id ?? EMR_PHASES[0].id
  }, [byPhase])

  return (
    <section className="emr-roadmap" aria-label="EMR Launch tasks">
      <ol className="emr-roadmap-track">
        {EMR_PHASES.map((phase) => {
          const items = byPhase.get(phase.id) ?? []
          return (
            <li key={phase.id} className={phase.id === currentId ? 'is-current' : undefined}>
              <span className="emr-roadmap-label">{phase.label}</span>
              <span className="emr-roadmap-node">{phase.number}</span>
              <div className="emr-roadmap-items">
                {items.length === 0 ? (
                  <p className="emr-roadmap-empty">Nothing assigned</p>
                ) : (
                  items.map(({ task, status }) => (
                    <p key={task.id} className={`emr-roadmap-item is-${status}`}>
                      {task.title}
                    </p>
                  ))
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
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
