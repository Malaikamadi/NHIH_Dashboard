import { useMemo, useState } from 'react'
import { MetricCard, RingChart, WeekBars } from '../components/Cards'
import { WeeklyReportModal } from '../components/WeeklyReport'
import { useOps } from '../store/OpsContext'
import {
  completedOnTime,
  displayStatus,
  memberWorkloads,
  teamMetrics,
  weeklyCompletions,
} from '../utils/metrics'

export function PerformanceView() {
  const { state } = useOps()
  const [reportOpen, setReportOpen] = useState(false)
  const now = useMemo(() => new Date(), [state.tasks])
  const metrics = teamMetrics(state, now)
  const week = weeklyCompletions(state.tasks, now)
  const people = memberWorkloads(state, now)
  const overdue = metrics.overdue
  const inFlight = metrics.inProgress
  const onTimeRate =
    metrics.completedWeek === 0
      ? 0
      : Math.round(
          (state.tasks.filter((t) => completedOnTime(t) && t.completedAt).length /
            Math.max(state.tasks.filter((t) => t.status === 'completed').length, 1)) *
            100,
        )

  return (
    <div className="view performance-view">
      <div className="paper-h">
        <div>
          <h2>Performance</h2>
          <p className="muted">Closed work, on-time delivery, and load by person</p>
        </div>
        <button type="button" className="primary-btn sm" onClick={() => setReportOpen(true)}>
          Weekly report
        </button>
      </div>
      <section className="metric-strip">
        <MetricCard label="Completed This Week" value={metrics.completedWeek} hint="Last 7 days" tone="ok" />
        <MetricCard label="Overall Completion" value={`${metrics.completionRate}%`} hint="Closed vs assigned" />
        <MetricCard label="Completed On Time" value={metrics.onTime} hint={`${onTimeRate}% of all completed`} tone="ok" />
        <MetricCard label="Tasks Overdue" value={overdue} hint="Open and past due" tone={overdue ? 'danger' : 'ok'} />
        <MetricCard label="In Progress" value={inFlight} hint="Active execution" />
      </section>

      <div className="perf-grid">
        <section className="panel hero-panel">
          <header className="panel-h">
            <h2>Overall Team Completion Rate</h2>
          </header>
          <div className="hero-split">
            <RingChart value={metrics.completionRate} label="of assigned work closed" />
            <div className="legend-stack">
              <div className="legend-row">
                <span className="swatch ok" /> Completed
                <strong>{state.tasks.filter((t) => displayStatus(t, now) === 'completed').length}</strong>
              </div>
              <div className="legend-row">
                <span className="swatch warn" /> In progress
                <strong>{inFlight}</strong>
              </div>
              <div className="legend-row">
                <span className="swatch danger" /> Overdue
                <strong>{overdue}</strong>
              </div>
              <div className="legend-row">
                <span className="swatch mute" /> Pending
                <strong>
                  {state.tasks.filter((t) => displayStatus(t, now) === 'not_started').length}
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <header className="panel-h">
            <h2>Weekly Completions</h2>
            <span className="panel-note">Tasks closed in the last 7 days</span>
          </header>
          <WeekBars series={week} />
          <div className="compare">
            <div>
              <div className="compare-label">Completed</div>
              <div className="compare-value ok">{metrics.completedWeek}</div>
            </div>
            <div className="compare-vs">vs</div>
            <div>
              <div className="compare-label">Overdue</div>
              <div className="compare-value danger">{overdue}</div>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <header className="panel-h">
          <h2>Individual Completion</h2>
          <span className="panel-note">Closed vs still open by person</span>
        </header>
        <div className="people-stats">
          {people.map((row) => {
            const total = Math.max(row.assigned, 1)
            const pct = Math.round((row.completed / total) * 100)
            return (
              <div key={row.member.id} className="person-stat">
                <div className="person-id">
                  <span className="avatar">{row.member.initials}</span>
                  <div>
                    <strong>{row.member.name}</strong>
                    <div className="muted">{row.member.role}</div>
                  </div>
                </div>
                <div className="person-bar">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <div className="person-nums">
                  <span>{row.completed} done</span>
                  <span>{row.active} open</span>
                  <span className={row.overdue ? 'warn-text' : ''}>{row.overdue} overdue</span>
                  <strong>{pct}%</strong>
                </div>
              </div>
            )
          })}
        </div>
      </section>
      {reportOpen && (
        <WeeklyReportModal onClose={() => setReportOpen(false)} />
      )}
    </div>
  )
}
