import { useMemo, useState } from 'react'
import { MemberDesk } from '../components/MemberDesk'
import { useOps } from '../store/OpsContext'
import { memberWorkloads, WORKLOAD_LABEL } from '../utils/metrics'

export function WorkloadView() {
  const { state } = useOps()
  const [openId, setOpenId] = useState<string | null>(null)
  const now = useMemo(() => new Date(), [state.tasks])
  const rows = memberWorkloads(state, now)
  const overloadedRows = rows.filter((r) => r.level === 'overloaded' || r.level === 'heavy' || r.overdue > 0)
  const activeRows = rows.filter((r) => r.active > 0 && !overloadedRows.some((x) => x.member.id === r.member.id))
  const capacityRows = rows.filter((r) => r.active === 0 && !overloadedRows.some((x) => x.member.id === r.member.id))
  const selected = state.members.find((m) => m.id === openId)
  const openAssignments = rows.reduce((n, r) => n + r.active, 0)

  const PersonRow = ({ row, attention = false }: { row: (typeof rows)[number]; attention?: boolean }) => (
    <button type="button" className={`ops-work-person ${attention ? 'needs-attention' : ''}`} onClick={() => setOpenId(row.member.id)}>
      <span className="avatar lg">{row.member.initials}</span>
      <span className="ops-work-person-main">
        <strong>{row.member.name}</strong>
        <small>{row.member.role}</small>
      </span>
      <span className="ops-work-person-stats">
        <strong>{row.active} active</strong>
        <small className={row.overdue ? 'warn-text' : ''}>{row.overdue} overdue · {row.completed} completed</small>
      </span>
      <span className={`load-badge load-${row.level}`}>{WORKLOAD_LABEL[row.level]}</span>
    </button>
  )

  return (
    <div className="view workload-view">
      <section className="metric-strip">
        <article className="metric">
          <div className="metric-label">Team Members</div>
          <div className="metric-value">{rows.length}</div>
          <div className="metric-hint">On the operations board</div>
        </article>
        <article className={`metric ${overloadedRows.length ? 'tone-danger' : 'tone-ok'}`}>
          <div className="metric-label">Needs Attention</div>
          <div className="metric-value">{overloadedRows.length}</div>
          <div className="metric-hint">Overdue or overloaded</div>
        </article>
        <article className="metric tone-ok">
          <div className="metric-label">Available Capacity</div>
          <div className="metric-value">{capacityRows.length}</div>
          <div className="metric-hint">No active assignments</div>
        </article>
        <article className="metric">
          <div className="metric-label">Open Assignments</div>
          <div className="metric-value">{openAssignments}</div>
          <div className="metric-hint">Active work across the team</div>
        </article>
      </section>

      <section className="panel ops-workload-panel">
        <header className="panel-h">
          <div>
            <h2>Workload Distribution</h2>
            <span className="panel-note">Attention first · active execution · available capacity</span>
          </div>
          <span className="panel-note">Click a name to view assigned work</span>
        </header>

        <div className="ops-work-section attention-section">
          <div className="ops-work-section-h">
            <div><strong>Needs Attention Now</strong><small>Priority review</small></div>
            <span>{overloadedRows.length} people</span>
          </div>
          {overloadedRows.length ? (
            <div className="ops-work-list attention-list">{overloadedRows.map((row) => <PersonRow key={row.member.id} row={row} attention />)}</div>
          ) : <div className="ops-work-empty">No overloaded or overdue assignments.</div>}
        </div>

        <div className="ops-work-section">
          <div className="ops-work-section-h">
            <div><strong>Active Execution</strong><small>Team members currently carrying open work</small></div>
            <span>{activeRows.length} people</span>
          </div>
          {activeRows.length ? (
            <div className="ops-work-list">{activeRows.map((row) => <PersonRow key={row.member.id} row={row} />)}</div>
          ) : <div className="ops-work-empty">No other active assignments.</div>}
        </div>

        <details className="ops-capacity" open>
          <summary>
            <span><strong>Available Capacity</strong><small>Team members with no active assignments</small></span>
            <b>{capacityRows.length} people</b>
          </summary>
          <div className="capacity-chips">
            {capacityRows.map((row) => (
              <button type="button" key={row.member.id} onClick={() => setOpenId(row.member.id)}>
                <span className="avatar">{row.member.initials}</span>
                <span><strong>{row.member.name}</strong><small>{row.member.role}</small></span>
              </button>
            ))}
          </div>
        </details>
      </section>
      {selected && <MemberDesk member={selected} onClose={() => setOpenId(null)} />}
    </div>
  )
}
