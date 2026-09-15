import { useEffect, useMemo } from 'react'
import { PlaceLine } from './PlaceFields'
import { useOps } from '../store/OpsContext'
import type { TeamMember } from '../types'
import { displayStatus } from '../utils/metrics'
import { formatDue } from '../utils/time'
import { PriorityMark, StatusPill } from './Header'

export function MemberDesk({
  member,
  onClose,
}: {
  member: TeamMember
  onClose: () => void
}) {
  const { state } = useOps()
  const now = useMemo(() => new Date(), [state.tasks])
  const mine = state.tasks.filter((t) => t.assignedTo === member.id)
  const open = mine
    .filter((t) => displayStatus(t, now) !== 'completed')
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))
  const done = mine
    .filter((t) => displayStatus(t, now) === 'completed')
    .sort((a, b) => +new Date(b.completedAt ?? b.dueDate) - +new Date(a.completedAt ?? a.dueDate))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="admin-scrim" onClick={onClose}>
      <aside className="admin member-desk" onClick={(e) => e.stopPropagation()}>
        <header className="admin-h">
          <div>
            <div className="hdr-kicker">{member.role}</div>
            <h2>{member.name}</h2>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="admin-help">
          {open.length} open · {done.length} completed. Updates are entered on the operator desk.
        </p>

        <section className="admin-live">
          <h3>Open tasks</h3>
          <div className="admin-list">
            {open.length === 0 && <p className="muted">No open tasks.</p>}
            {open.map((task) => (
              <article key={task.id} className="member-task">
                <div className="member-task-top">
                  <div>
                    <h4>{task.title}</h4>
                    <PlaceLine
                      workKind={task.workKind}
                      workKindOther={task.workKindOther}
                      district={task.district}
                      facility={task.facility}
                    />
                    <p className="muted">{formatDue(task.dueDate, now)}</p>
                  </div>
                  <div className="member-task-marks">
                    <PriorityMark priority={task.priority} />
                    <StatusPill status={displayStatus(task, now)} />
                  </div>
                </div>
                {task.description && <p className="muted">{task.description}</p>}
              </article>
            ))}
          </div>

          {done.length > 0 && (
            <>
              <h3>Completed</h3>
              <div className="admin-list">
                {done.map((task) => (
                  <article key={task.id} className="member-task">
                    <div className="member-task-top">
                      <h4>{task.title}</h4>
                      <StatusPill status="completed" />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </aside>
    </div>
  )
}
