import { activityKindLabel, districtLabel, logKindLabel, placeLine } from '../data/catalog'
import type { OpsState } from '../types'
import {
  agendaLines,
  completedOnTime,
  meetingStatus,
  memberName,
  memberWorkloads,
  periodBounds,
  teamMetrics,
} from './metrics'
import { formatDate, formatRange, formatTime, formatTimeRange, isInRange } from './time'

export interface WeeklyReportPerson {
  name: string
  role: string
  closed: number
  open: number
  overdue: number
}

export interface WeeklyReportAction {
  title: string
  place: string
  owner: string
  status: string
  deadline: string
}

export interface WeeklyReportLog {
  at: string
  kind: string
  title: string
  place: string
  detail: string
  author: string
}

export interface WeeklyReportMeeting {
  id: string
  title: string
  when: string
  attendees: string
  agenda: string
  notes: string
  actions: WeeklyReportAction[]
}

export interface WeeklyReportActivity {
  id: string
  title: string
  kind: string
  when: string
  place: string
  attendees: string
  notes: string
}

export interface WeeklyReport {
  generatedAt: string
  rangeLabel: string
  performance: {
    completionRate: number
    closed: number
    overdue: number
    inProgress: number
    onTime: number
    meetings: number
    activities: number
    openActions: number
    hubLog: number
  }
  people: WeeklyReportPerson[]
  hubLog: WeeklyReportLog[]
  meetings: WeeklyReportMeeting[]
  activities: WeeklyReportActivity[]
}

export function buildWeeklyReport(state: OpsState, now = new Date()): WeeklyReport {
  const { start, end } = periodBounds('Weekly', now)
  const metrics = teamMetrics(state, now)
  const closed = state.tasks.filter((t) => t.completedAt && isInRange(t.completedAt, start, end))
  const meetings = state.meetings
    .filter((m) => isInRange(m.startTime, start, end))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
  const weekActivities = [...(state.activities ?? [])]
    .filter((item) => isInRange(item.startTime, start, end))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
  const people = memberWorkloads(state, now).map((row) => ({
    name: row.member.name,
    role: row.member.role,
    closed: state.tasks.filter(
      (t) => t.assignedTo === row.member.id && t.completedAt && isInRange(t.completedAt, start, end),
    ).length,
    open: row.active,
    overdue: row.overdue,
  }))

  const hubLog = [...(state.hubLog ?? [])]
    .filter((entry) => isInRange(entry.at, start, end))
    .sort((a, b) => +new Date(a.at) - +new Date(b.at))
    .map((entry) => ({
      at: `${formatDate(entry.at)} · ${formatTime(entry.at)}`,
      kind: logKindLabel(entry.kind),
      title: entry.title,
      place: entry.facility
        ? `${districtLabel(entry.district)} · ${entry.facility}`
        : districtLabel(entry.district),
      detail: entry.detail,
      author: memberName(state.members, entry.authorId),
    }))

  return {
    generatedAt: now.toISOString(),
    rangeLabel: formatRange(start, end),
    performance: {
      completionRate: metrics.completionRate,
      closed: closed.length,
      overdue: metrics.overdue,
      inProgress: metrics.inProgress,
      onTime: closed.filter((t) => completedOnTime(t)).length,
      meetings: meetings.length,
      activities: weekActivities.length,
      openActions: state.actionItems.filter((a) => a.status !== 'completed').length,
      hubLog: hubLog.length,
    },
    people,
    hubLog,
    meetings: meetings.map((meeting) => {
      const actions = state.actionItems.filter((a) => a.meetingId === meeting.id)
      return {
        id: meeting.id,
        title: meeting.title,
        when: `${formatDate(meeting.startTime)} · ${formatTimeRange(meeting.startTime, meeting.endTime)} · ${meetingStatus(meeting, now)}`,
        attendees: meeting.participantIds.map((id) => memberName(state.members, id)).join(', '),
        agenda: meeting.agenda?.trim() ?? '',
        notes: meeting.notes?.trim() ?? '',
        actions: actions.map((item) => ({
          title: item.title,
          place: placeLine(item.workKind, item.district, item.facility, item.workKindOther),
          owner: memberName(state.members, item.assignedTo),
          status: item.status.replace('_', ' '),
          deadline: formatDate(item.deadline),
        })),
      }
    }),
  }
}

export function reportFileName(report: WeeklyReport): string {
  const stamp = report.rangeLabel.replace(/[–—]/g, 'to').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `NHIH-weekly-ops-report-${stamp}.html`
}

export function reportToHtml(report: WeeklyReport): string {
  const peopleRows = report.people
    .map(
      (p) =>
        `<tr><td>${esc(p.name)}</td><td>${esc(p.role)}</td><td>${p.closed}</td><td>${p.open}</td><td>${p.overdue}</td></tr>`,
    )
    .join('')

  const hubLogRows = report.hubLog
    .map(
      (entry) =>
        `<tr><td>${esc(entry.at)}</td><td>${esc(entry.kind)}</td><td>${esc(entry.title)}</td><td>${esc(entry.place)}</td><td>${esc(entry.detail || '—')}</td><td>${esc(entry.author)}</td></tr>`,
    )
    .join('')

  const meetingBlocks = report.meetings
    .map((m) => {
      const actions = m.actions.length
        ? `<table><thead><tr><th>Action</th><th>Type / place</th><th>Owner</th><th>Status</th><th>Deadline</th></tr></thead><tbody>${m.actions
            .map(
              (a) =>
                `<tr><td>${esc(a.title)}</td><td>${esc(a.place)}</td><td>${esc(a.owner)}</td><td>${esc(a.status)}</td><td>${esc(a.deadline)}</td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="mute">No action items recorded.</p>'
      const minutes = m.notes
        ? `<p class="minutes">${esc(m.notes)}</p>`
        : '<p class="mute">Minutes not captured for this session.</p>'
      const items = agendaLines(m.agenda)
      const agenda = items.length
        ? `<ol class="agenda">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>`
        : '<p class="mute">Agenda not set for this session.</p>'
      return `<section class="meeting"><h3>${esc(m.title)}</h3><p class="meta">${esc(m.when)}</p><p class="meta">Attendees: ${esc(m.attendees)}</p><h4>Agenda</h4>${agenda}<h4>Minutes</h4>${minutes}<h4>Action items</h4>${actions}</section>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>NHIH Weekly Operations Report · ${esc(report.rangeLabel)}</title>
  <style>
    body { font-family: Inter, "Segoe UI", sans-serif; color: #1f2933; background: #fff; margin: 0; padding: 32px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 28px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    h3 { font-size: 15px; margin: 0 0 4px; }
    h4 { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; margin: 12px 0 6px; }
    .kicker { color: #1f4e79; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .mute, .meta { color: #6b7280; font-size: 13px; margin: 2px 0; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0 8px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
    .kpi strong { display: block; font-size: 22px; }
    .kpi span { color: #6b7280; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    th { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; }
    .meeting { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin: 12px 0; }
    .minutes { white-space: pre-wrap; line-height: 1.45; font-size: 14px; }
    .agenda { margin: 0; padding-left: 18px; }
    .agenda li { margin: 2px 0; }
    @media print { body { padding: 16px; } .kpis { break-inside: avoid; } .meeting { break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="kicker">NHIH Team Operations</div>
  <h1>Weekly operations report</h1>
  <p class="meta">${esc(report.rangeLabel)} · Generated ${esc(new Date(report.generatedAt).toLocaleString())}</p>

  <h2>Team performance</h2>
  <div class="kpis">
    <div class="kpi"><strong>${report.performance.completionRate}%</strong><span>Completion rate</span></div>
    <div class="kpi"><strong>${report.performance.closed}</strong><span>Tasks closed this week</span></div>
    <div class="kpi"><strong>${report.performance.onTime}</strong><span>Closed on time</span></div>
    <div class="kpi"><strong>${report.performance.overdue}</strong><span>Still overdue</span></div>
    <div class="kpi"><strong>${report.performance.inProgress}</strong><span>In progress</span></div>
    <div class="kpi"><strong>${report.performance.meetings}</strong><span>Meetings this week</span></div>
    <div class="kpi"><strong>${report.performance.openActions}</strong><span>Open action items</span></div>
    <div class="kpi"><strong>${report.performance.hubLog}</strong><span>Hub log entries</span></div>
  </div>

  <h2>Hub log</h2>
  ${
    hubLogRows
      ? `<table><thead><tr><th>When</th><th>Kind</th><th>What happened</th><th>Where</th><th>Detail</th><th>Logged by</th></tr></thead><tbody>${hubLogRows}</tbody></table>`
      : '<p class="mute">No extract, late-reporting, or incident entries this week.</p>'
  }

  <h2>Individual performance</h2>
  <table>
    <thead><tr><th>Name</th><th>Role</th><th>Closed this week</th><th>Open</th><th>Overdue</th></tr></thead>
    <tbody>${peopleRows}</tbody>
  </table>

  <h2>Meetings and minutes</h2>
  ${meetingBlocks || '<p class="mute">No meetings recorded in this period.</p>'}
</body>
</html>`
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
