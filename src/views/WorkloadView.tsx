import { useMemo, useState } from 'react'
import { MemberDesk } from '../components/MemberDesk'
import { useOps } from '../store/OpsContext'
import { memberWorkloads, WORKLOAD_LABEL } from '../utils/metrics'

export function WorkloadView() {
  const { state } = useOps()
  const [openId, setOpenId] = useState<string | null>(null)
  const now = useMemo(() => new Date(), [state.tasks])
  const rows = memberWorkloads(state, now)
  const maxAssigned = Math.max(...rows.map((r) => r.assigned), 1)
  const overloaded = rows.filter((r) => r.level === 'overloaded' || r.level === 'heavy').length
  const light = rows.filter((r) => r.level === 'light').length
  const selected = state.members.find((m) => m.id === openId)

  return (
    <div className="view workload-view">
      <section className="metric-strip">
        <article className="metric">
          <div className="metric-label">Team Members</div>
          <div className="metric-value">{rows.length}</div>
          <div className="metric-hint">On the operations board</div>
        </article>
        <article className={`metric ${overloaded ? 'tone-danger' : 'tone-ok'}`}>
          <div className="metric-label">Heavy / Overloaded</div>
          <div className="metric-value">{overloaded}</div>
          <div className="metric-hint">Need load relief</div>
        </article>
        <article className="metric tone-ok">
          <div className="metric-label">Light Load</div>
          <div className="metric-value">{light}</div>
          <div className="metric-hint">Capacity available</div>
        </article>
        <article className="metric">
          <div className="metric-label">Open Assignments</div>
          <div className="metric-value">{rows.reduce((n, r) => n + r.active, 0)}</div>
          <div className="metric-hint">Active work across the team</div>
        </article>
      </section>

      <section className="panel">
        <header className="panel-h">
          <h2>Workload Distribution</h2>
          <span className="panel-note">Click a name to view and add tasks</span>
        </header>
        <div className="workload-grid">
          {rows.map((row) => (
            <article key={row.member.id} className={`work-card is-${row.level}`}>
              <header className="work-head">
                <span className="avatar lg">{row.member.initials}</span>
                <div>
                  <button
                    type="button"
                    className="member-name-btn"
                    onClick={() => setOpenId(row.member.id)}
                  >
                    {row.member.name}
                  </button>
                  <div className="muted">{row.member.role}</div>
                </div>
                <span className={`load-badge load-${row.level}`}>{WORKLOAD_LABEL[row.level]}</span>
              </header>
              <div className="work-nums">
                <div>
                  <strong>{row.active}</strong>
                  <span>Active</span>
                </div>
                <div>
                  <strong>{row.completed}</strong>
                  <span>Completed</span>
                </div>
                <div>
                  <strong className={row.overdue ? 'warn-text' : ''}>{row.overdue}</strong>
                  <span>Overdue</span>
                </div>
              </div>
              <div className="work-bar">
                <span className="seg active" style={{ width: `${(row.active / maxAssigned) * 100}%` }} />
                <span className="seg done" style={{ width: `${(row.completed / maxAssigned) * 100}%` }} />
                <span className="seg late" style={{ width: `${(row.overdue / maxAssigned) * 100}%` }} />
              </div>
              <div className="work-foot">{row.assigned} tasks assigned</div>
            </article>
          ))}
        </div>
      </section>
      {selected && <MemberDesk member={selected} onClose={() => setOpenId(null)} />}
    </div>
  )
}
