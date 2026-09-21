import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ActivitySession } from '../components/ActivityForm'
import { Avatar, PriorityMark, StatusPill } from '../components/Header'
import { Icon } from '../components/Icons'
import { HubLogPanel } from '../components/HubLogPanel'
import { MeetingSession } from '../components/MeetingActions'
import { HubBrief } from '../components/HubBrief'
import { PlaceLine } from '../components/PlaceFields'
import { WeeklyReportModal } from '../components/WeeklyReport'
import { districtIds, placeLine } from '../data/catalog'
import { useOps } from '../store/OpsContext'
import type { DistrictId, PeriodId, ViewId } from '../types'
import {
  districtWorkload,
  displayStatus,
  dueOnDayTasks,
  hotspotDistrict,
  memberById,
  memberIndex,
  memberNames,
  openTodayActivities,
  openWeekMeetings,
  overdueTasks,
  PERIOD_CLOSED_LABEL,
  PERIOD_COPY,
  PERIODS,
  periodClosedCount,
  periodCompletionRate,
  periodSeries,
  periodStatusBreakdown,
  primaryAssigneeId,
  priorityBand,
  startingSoon,
  statusBreakdown,
  teamMetrics,
  completedThisWeek,
} from '../utils/metrics'
import { countdown, formatDate, isSameDay, parseDateInput, toDateInput, weekDays } from '../utils/time'

type Spotlight = 'meetings' | 'activities' | 'due' | 'progress' | 'overdue' | 'completed' | null

export function TodayOpsView({ onOpenView }: { onOpenView: (id: ViewId) => void }) {
  const { state } = useOps()
  const [now, setNow] = useState(() => new Date())
  const [period, setPeriod] = useState<PeriodId>('Weekly')
  const [mixPeriod, setMixPeriod] = useState<PeriodId>('Weekly')
  const [query, setQuery] = useState('')
  const [spotlight, setSpotlight] = useState<Spotlight>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [districtFilter, setDistrictFilter] = useState<DistrictId | null>(null)
  const [dueDay, setDueDay] = useState(() => new Date())
  const [dismissedSoon, setDismissedSoon] = useState<string[]>([])
  const detailRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const metrics = teamMetrics(state, now)
  const series = periodSeries(period, state.tasks, now)
  const breakdown = statusBreakdown(state.tasks, now)
  const mixBreakdown = periodStatusBreakdown(state.tasks, mixPeriod, now)
  const mixTotal =
    mixBreakdown.completed +
    mixBreakdown.in_progress +
    mixBreakdown.not_started +
    mixBreakdown.overdue
  const completedSeries = series.map((d) => d.completed)
  const dueSeries = series.map((d) => d.due)
  const closedInPeriod = periodClosedCount(state.tasks, period, now)
  const periodRate = periodCompletionRate(state.tasks, period, now)
  const meetings = openWeekMeetings(state.meetings, now)
  const activities = openTodayActivities(state.activities, now)
  const soon = startingSoon(state.meetings, state.activities, now).filter(
    (item) => !dismissedSoon.includes(item.id),
  )
  const dueDays = weekDays(now)
  const districts = districtWorkload(state.tasks, now)
  const hotspot = hotspotDistrict(state.tasks, now)
  const tasks = useMemo(() => {
    const open = state.tasks.filter((t) => displayStatus(t, now) !== 'completed')
    const done = state.tasks
      .filter((t) => displayStatus(t, now) === 'completed')
      .sort(
        (a, b) =>
          +new Date(b.completedAt ?? b.dueDate) - +new Date(a.completedAt ?? a.dueDate),
      )

    let list =
      spotlight === 'completed'
        ? done
        : spotlight === 'due'
          ? dueOnDayTasks(state.tasks, dueDay, now)
          : spotlight === 'progress'
            ? open.filter((t) => {
                const status = displayStatus(t, now)
                return status === 'in_progress' || status === 'under_review'
              })
            : spotlight === 'overdue'
              ? overdueTasks(state.tasks, now)
              : [
                  ...open.sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)),
                  ...done.filter((t) => completedThisWeek(t, now)),
                ]

    if (districtFilter) list = list.filter((t) => districtIds(t.district).includes(districtFilter))
    const q = query.trim().toLowerCase()
    return list.filter((t) => {
      if (!q) return true
      return (
        t.title.toLowerCase().includes(q) ||
        placeLine(t.workKind, t.district, t.facility, t.workKindOther).toLowerCase().includes(q)
      )
    })
  }, [state.tasks, now, query, spotlight, districtFilter, dueDay])

  const openSpotlight = (next: Spotlight) => {
    setDistrictFilter(null)
    setSpotlight((current) => (current === next ? null : next))
    window.setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const selectedDistrict = districts.find((d) => d.id === districtFilter)
  const tableTitle =
    selectedDistrict
      ? selectedDistrict.label
      : spotlight === 'meetings'
      ? "This week's meetings"
      : spotlight === 'activities'
        ? "Today's Activities"
        : spotlight === 'due'
        ? `Tasks due · ${formatDate(dueDay.toISOString())}`
        : spotlight === 'progress'
          ? 'In Progress'
          : spotlight === 'overdue'
            ? 'Overdue Tasks'
            : spotlight === 'completed'
              ? 'Tasks Completed'
              : 'Priority Tasks'

  const tableHint =
    selectedDistrict
      ? selectedDistrict.overdue
        ? `${selectedDistrict.label} still open`
        : `${selectedDistrict.open} open ${selectedDistrict.open === 1 ? 'item' : 'items'}`
      : spotlight === 'meetings'
        ? 'Live and upcoming huddles this week — completed meetings drop off automatically'
        : spotlight === 'activities'
          ? 'Trainings, field visits, and other events the team is attending'
        : spotlight === 'due'
          ? isSameDay(dueDay, now)
            ? 'Still open and due today'
            : `Still open and due ${formatDate(dueDay.toISOString())}`
          : spotlight === 'progress'
            ? 'Active and under review'
            : spotlight === 'overdue'
              ? hotspot
                ? `${hotspot.label} still open`
                : 'Past due and still open'
              : spotlight === 'completed'
                ? 'Closed work stays on the board — newest first'
                : 'Open work first, then tasks completed this week'

  return (
    <div className="view light-dash">
      {soon.map((item) => (
        <aside key={item.id} className="soon-banner">
          <Icon name="bell" size={16} />
          <div>
            <strong>
              {item.kind === 'meeting' ? 'Meeting' : 'Activity'} starts in {countdown(item.startTime, now)}
            </strong>
            <span>{item.title}</span>
          </div>
          <button type="button" className="ghost-btn" onClick={() => setDismissedSoon((ids) => [...ids, item.id])}>
            Dismiss
          </button>
        </aside>
      ))}
      <HubBrief
        now={now}
        onOpenMeetings={() => {
          setDistrictFilter(null)
          setSpotlight('meetings')
          window.setTimeout(() => {
            detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 50)
        }}
        onOpenActivities={() => {
          setDistrictFilter(null)
          setSpotlight('activities')
          window.setTimeout(() => {
            detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 50)
        }}
        onOpenOverdue={() => {
          setDistrictFilter(hotspot?.id ?? null)
          setSpotlight('overdue')
          window.setTimeout(() => {
            detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 50)
        }}
      />
      <div className="hero-row">
        <section className="paper overview-card">
          <header className="paper-h">
            <div>
              <h2>Dashboard</h2>
              <p>{PERIOD_COPY[period]}</p>
            </div>
            <div className="period-tabs">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={period === p ? 'is-active' : ''}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </header>

          <div className="overview-kpis">
            <div>
              <strong>{periodRate}%</strong>
              <span>Completion rate · {period.toLowerCase()}</span>
            </div>
            <div>
              <strong>{closedInPeriod}</strong>
              <span>{PERIOD_CLOSED_LABEL[period]}</span>
            </div>
            <button type="button" className="primary-btn" onClick={() => setReportOpen(true)}>
              Ops report
            </button>
          </div>

          <AreaChart
            a={completedSeries}
            b={dueSeries}
            labels={series.map((d) => d.label)}
            aLabel="Completed"
            bLabel="Due"
          />
        </section>

        <section className="paper table-card" ref={detailRef}>
          <header className="paper-h">
            <div>
              <h2>{tableTitle}</h2>
              <p>{tableHint}</p>
            </div>
            <div className="table-tools">
              {spotlight === 'due' && (
                <div className="day-picks" aria-label="Due day">
                  {dueDays.map((day) => (
                    <button
                      key={toDateInput(day)}
                      type="button"
                      className={isSameDay(day, dueDay) ? 'is-on' : ''}
                      onClick={() => setDueDay(day)}
                    >
                      {isSameDay(day, now) ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                    </button>
                  ))}
                  <label className="day-pick-date">
                    <span>Pick day</span>
                    <input
                      type="date"
                      value={toDateInput(dueDay)}
                      onChange={(e) => setDueDay(parseDateInput(e.target.value, dueDay))}
                    />
                  </label>
                </div>
              )}
              {(spotlight || districtFilter) && (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setSpotlight(null)
                    setDistrictFilter(null)
                  }}
                >
                  Clear filter
                </button>
              )}
              {spotlight !== 'meetings' && spotlight !== 'activities' && (
                <label className="search">
                  <Icon name="search" size={14} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" />
                </label>
              )}
            </div>
          </header>
          {spotlight === 'meetings' ? (
            <div className="data-table table-scroll">
              <div className="data-head meet-head">
                <span>Meeting</span>
                <span>Time</span>
                <span>Participants</span>
                <span>Status</span>
              </div>
              {meetings.map((meeting) => (
                <MeetingSession key={meeting.id} meeting={meeting} now={now} readOnly />
              ))}
              {meetings.length === 0 && (
                <div className="data-row meet-row">
                  <span className="muted table-empty">No remaining meetings this week.</span>
                </div>
              )}
            </div>
          ) : spotlight === 'activities' ? (
            <div className="data-table table-scroll">
              <div className="data-head activity-row">
                <span>Activity</span>
                <span>Type / place</span>
                <span>Time</span>
                <span>Attending</span>
                <span>Status</span>
              </div>
              {activities.map((activity) => (
                <ActivitySession key={activity.id} activity={activity} now={now} readOnly />
              ))}
              {activities.length === 0 && (
                <div className="data-row activity-row">
                  <span className="muted table-empty">No remaining activities today.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="data-table is-view table-scroll">
              <div className="data-head">
                <span>Task</span>
                <span>Assigned</span>
                <span>Priority</span>
                <span>Due</span>
                <span>Status</span>
              </div>
              {tasks.length === 0 && (
                <div className="data-row">
                  <span className="muted table-empty">
                    {spotlight === 'due'
                      ? `No open tasks due ${formatDate(dueDay.toISOString())}.`
                      : spotlight === 'completed'
                        ? 'No completed tasks yet. Closed work will stay listed here.'
                        : 'No live tasks yet. Prince can add them from the operator desk.'}
                  </span>
                </div>
              )}
              {tasks.map((task) => {
                const primaryId = primaryAssigneeId(task.assignedTo)
                const owner = primaryId ? memberById(state.members, primaryId) : undefined
                return (
                  <div
                    key={task.id}
                    className={`data-row ${displayStatus(task, now) === 'completed' ? 'is-done' : ''}`}
                  >
                    <div className="task-cell">
                      <strong>{task.title}</strong>
                      <PlaceLine
                        workKind={task.workKind}
                        workKindOther={task.workKindOther}
                        district={task.district}
                        facility={task.facility}
                      />
                    </div>
                    <span className="who">
                      {owner && (
                        <Avatar
                          name={owner.name}
                          initials={owner.initials}
                          index={memberIndex(state.members, owner.id)}
                        />
                      )}
                      {memberNames(state.members, task.assignedTo)}
                    </span>
                    <PriorityMark priority={priorityBand(task.priority)} />
                    <span>{formatDate(task.dueDate)}</span>
                    <span className="status-stack">
                      <StatusPill status={displayStatus(task, now)} />
                      <em className="muted">{task.progress}%</em>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <div className="table-foot">
            {spotlight === 'meetings'
              ? `Showing ${meetings.length} remaining meetings this week`
              : spotlight === 'activities'
                ? `Showing ${activities.length} activities`
              : spotlight === 'completed'
                ? `Showing ${tasks.length} completed tasks`
              : `Showing ${tasks.length} tasks`}
            <button type="button" className="link-btn" onClick={() => onOpenView('workload')}>
              View team load
            </button>
          </div>
        </section>
      </div>

      <div className="gcard-row">
        <StatusCard
          tone={metrics.liveMeetings ? 'ok' : 'info'}
          label="Meetings this week"
          value={metrics.meetingsThisWeek}
          hint={metrics.liveMeetings ? `${metrics.liveMeetings} live now` : 'Upcoming only'}
          values={completedSeries}
          active={spotlight === 'meetings'}
          onClick={() => openSpotlight('meetings')}
        />
        <StatusCard
          tone={metrics.liveActivities ? 'ok' : 'info'}
          label="Activities Today"
          value={metrics.activitiesToday}
          hint={metrics.liveActivities ? `${metrics.liveActivities} happening now` : 'None happening now'}
          values={dueSeries}
          active={spotlight === 'activities'}
          onClick={() => openSpotlight('activities')}
        />
        <StatusCard
          tone={metrics.dueToday ? 'warn' : 'info'}
          label="Tasks Due Today"
          value={metrics.dueToday}
          hint={`${metrics.highPriorityDue} high priority`}
          values={dueSeries}
          active={spotlight === 'due'}
          onClick={() => {
            setDueDay(new Date())
            openSpotlight('due')
          }}
        />
        <StatusCard
          tone="info"
          label="In Progress"
          value={metrics.inProgress}
          hint="Active execution"
          values={completedSeries.slice().reverse()}
          active={spotlight === 'progress'}
          onClick={() => openSpotlight('progress')}
        />
        <StatusCard
          tone={breakdown.completed ? 'ok' : 'info'}
          label="Tasks Completed"
          value={breakdown.completed}
          hint={
            metrics.completedToday
              ? `${metrics.completedToday} today · ${metrics.completedWeek} this week`
              : metrics.completedWeek
                ? `${metrics.completedWeek} this week`
                : 'Closed work stays visible'
          }
          values={completedSeries}
          active={spotlight === 'completed'}
          onClick={() => openSpotlight('completed')}
        />
        <StatusCard
          tone={metrics.overdue ? 'danger' : 'ok'}
          label="Overdue Tasks"
          value={metrics.overdue}
          hint={hotspot ? `${hotspot.label} still open` : metrics.overdue ? 'Needs attention' : 'All clear'}
          values={dueSeries.slice().reverse()}
          active={spotlight === 'overdue'}
          onClick={() => openSpotlight('overdue')}
        />
      </div>

      {districts.length > 0 && (
        <div className="district-chips" aria-label="Open work by district">
          {districts.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`district-chip ${districtFilter === row.id ? 'is-on' : ''} ${row.overdue ? 'is-late' : ''}`}
              onClick={() => {
                setSpotlight(null)
                setDistrictFilter((current) => (current === row.id ? null : row.id))
                window.setTimeout(() => {
                  detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 50)
              }}
            >
              {row.overdue ? `${row.label} still open` : `${row.label} · ${row.open}`}
            </button>
          ))}
        </div>
      )}

      <div className="bottom-row">
        <HubLogPanel now={now} />

        <section className="paper traffic-card">
          <header className="paper-h">
            <div>
              <h2>Task Mix</h2>
              <p>
                {mixPeriod === 'Daily'
                  ? 'Status mix · due or closed today'
                  : mixPeriod === 'Weekly'
                    ? 'Status mix · last 7 days'
                    : mixPeriod === 'Monthly'
                      ? 'Status mix · this month'
                      : 'Status mix · this year'}
              </p>
            </div>
            <div className="period-tabs">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={mixPeriod === p ? 'is-active' : ''}
                  onClick={() => setMixPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </header>
          <StatusDonut
            total={mixTotal}
            segments={[
              { value: mixBreakdown.completed, color: 'var(--ok)' },
              { value: mixBreakdown.in_progress, color: 'var(--warn)' },
              { value: mixBreakdown.not_started, color: 'var(--muted)' },
              { value: mixBreakdown.overdue, color: 'var(--danger)' },
            ]}
          />
          <div className="traffic-legend">
            <LegendDot color="var(--ok)" label="Completed" value={mixBreakdown.completed} total={mixTotal} />
            <LegendDot color="var(--warn)" label="In progress" value={mixBreakdown.in_progress} total={mixTotal} />
            <LegendDot color="var(--muted)" label="Pending" value={mixBreakdown.not_started} total={mixTotal} />
            <LegendDot color="var(--danger)" label="Overdue" value={mixBreakdown.overdue} total={mixTotal} />
          </div>
        </section>
      </div>
      {reportOpen && (
        <WeeklyReportModal onClose={() => setReportOpen(false)} />
      )}
    </div>
  )
}

function StatusCard({
  tone,
  label,
  value,
  hint,
  values,
  active,
  onClick,
}: {
  tone: 'info' | 'warn' | 'danger' | 'ok'
  label: string
  value: number
  hint: string
  values: number[]
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`gcard gcard-${tone} ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{hint}</em>
      </div>
      <Sparkline values={values} />
    </button>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const w = 88
  const h = 36
  const max = Math.max(...values, 1)
  const d = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w
      const y = h - (v / max) * (h - 6) - 3
      return `${i === 0 ? 'M' : 'L'}${x} ${y}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke="var(--spark)" strokeWidth="2" />
    </svg>
  )
}

function AreaChart({
  a,
  b,
  labels,
  aLabel,
  bLabel,
}: {
  a: number[]
  b: number[]
  labels: string[]
  aLabel: string
  bLabel: string
}) {
  const uid = useId().replace(/:/g, '')
  const fillA = `fillCompleted-${uid}`
  const fillB = `fillDue-${uid}`
  const w = 720
  const h = 220
  const left = 28
  const right = 12
  const top = 16
  const bottom = 28
  const max = Math.max(...a, ...b, 1)
  const coords = (vals: number[]) =>
    vals.map((v, i) => {
      const x = left + (i / Math.max(vals.length - 1, 1)) * (w - left - right)
      const y = top + (1 - v / max) * (h - top - bottom)
      return [x, y] as const
    })
  const smooth = (pts: readonly (readonly [number, number])[]) => {
    if (!pts.length) return ''
    let d = `M ${pts[0][0]} ${pts[0][1]}`
    for (let i = 0; i < pts.length - 1; i++) {
      const cx = (pts[i][0] + pts[i + 1][0]) / 2
      d += ` C ${cx} ${pts[i][1]}, ${cx} ${pts[i + 1][1]}, ${pts[i + 1][0]} ${pts[i + 1][1]}`
    }
    return d
  }
  const pa = coords(a)
  const pb = coords(b)
  const area = (pts: readonly (readonly [number, number])[]) => {
    const line = smooth(pts)
    const last = pts[pts.length - 1]
    const first = pts[0]
    return `${line} L ${last[0]} ${h - bottom} L ${first[0]} ${h - bottom} Z`
  }
  const grid = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="chart-well">
      <div className="chart-legend">
        <span>
          <i style={{ background: 'var(--ok)' }} /> {aLabel}
        </span>
        <span>
          <i style={{ background: 'var(--muted)' }} /> {bLabel}
        </span>
      </div>
      <svg className="area-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${aLabel} vs ${bLabel}`}>
        <defs>
          <linearGradient id={fillA} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ok)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--ok)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={fillB} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--muted)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--muted)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {grid.map((g) => {
          const y = top + (1 - g) * (h - top - bottom)
          return <line key={g} x1={left} x2={w - right} y1={y} y2={y} className="chart-grid" />
        })}
        <path d={area(pa)} fill={`url(#${fillA})`} />
        <path d={area(pb)} fill={`url(#${fillB})`} />
        <path d={smooth(pa)} fill="none" stroke="var(--ok)" strokeWidth="2.5" />
        <path d={smooth(pb)} fill="none" stroke="var(--muted)" strokeWidth="2.5" />
        {pa.map(([x, y], i) => (
          <circle key={`a-${labels[i]}-${i}`} cx={x} cy={y} r="3.5" fill="var(--ok)" />
        ))}
        {pb.map(([x, y], i) => (
          <circle key={`b-${labels[i]}-${i}`} cx={x} cy={y} r="3.5" fill="var(--muted)" />
        ))}
        {labels.map((label, i) => (
          <text key={`${label}-${i}`} x={pa[i]?.[0] ?? 0} y={h - 8} textAnchor="middle" className="chart-label">
            {label}
          </text>
        ))}
      </svg>
    </div>
  )
}

function StatusDonut({
  total,
  segments,
}: {
  total: number
  segments: { value: number; color: string }[]
}) {
  const r = 52
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <svg viewBox="0 0 160 160" className="donut">
      {segments.map((seg) => {
        const len = total ? (seg.value / total) * c : 0
        const node = (
          <circle
            key={seg.color}
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="18"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 80 80)"
          />
        )
        offset += len
        return node
      })}
    </svg>
  )
}

function LegendDot({
  color,
  label,
  value,
  total,
}: {
  color: string
  label: string
  value: number
  total: number
}) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="legend-dot">
      <span style={{ background: color }} />
      <strong>{pct}%</strong>
      {label}
    </div>
  )
}
