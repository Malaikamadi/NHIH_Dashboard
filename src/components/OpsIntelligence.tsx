import { useState } from 'react'
import { useOps } from '../store/OpsContext'
import { displayStatus, memberNames, meetingStatus } from '../utils/metrics'
import type { Task } from '../types'

type DeskTab = 'task' | 'update' | 'meeting' | 'activity' | 'action' | 'log' | 'emr' | 'visitors'
const dateText = (value: Date) => value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const line = (value: string) => value.replace(/\s+/g, ' ').trim()

export function OpsIntelligence({ onOpen }: { onOpen: (tab: DeskTab) => void }) {
  const { state, connected } = useOps()
  const [showBrief, setShowBrief] = useState(true)
  const now = new Date()
  const tasks = state.tasks
  const open = tasks.filter(t => t.status !== 'completed')
  const overdue = open.filter(t => displayStatus(t, now) === 'overdue')
  const critical = open.filter(t => t.priority === 'critical' || t.priority === 'high')
  const incidents = state.hubLog.filter(e => e.kind === 'incident' && e.status !== 'completed')
  const actions = state.actionItems.filter(a => a.status !== 'completed')
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueToday = open.filter(t => { const d = new Date(t.dueDate); return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate() })
  const meetings = state.meetings.filter(m => { const d = new Date(m.startTime); return d.toDateString() === now.toDateString() && meetingStatus(m, now) !== 'completed' })
  const attention = [...overdue, ...critical.filter(t => !overdue.some(o => o.id === t.id)), ...dueToday.filter(t => !overdue.some(o => o.id === t.id) && !critical.some(c => c.id === t.id))].slice(0, 5)

  // Calendar week (Monday–Sunday), based on the device's local time.
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)
  const inWeek = (iso?: string) => { if (!iso) return false; const t = new Date(iso).getTime(); return t >= weekStart.getTime() && t < weekEnd.getTime() }
  const completed = tasks.filter(t => t.status === 'completed' && inWeek(t.completedAt))
  const newTasks = tasks.filter(t => inWeek(t.createdAt))
  const weekMeetings = state.meetings.filter(m => inWeek(m.startTime))
  const weekActivities = state.activities.filter(a => inWeek(a.startTime))
  const weekIncidents = state.hubLog.filter(e => e.kind === 'incident' && inWeek(e.at))
  const weekEndLabel = new Date(weekEnd.getTime() - 86400000)

  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
  const cell = (value: unknown) => '<td>' + esc(value) + '</td>'
  const table = (headers: string[], rows: unknown[][], empty: string) =>
    '<table><thead><tr>' + headers.map(h => '<th>' + esc(h) + '</th>').join('') +
    '</tr></thead><tbody>' + (rows.length ? rows.map(row => '<tr>' + row.map(cell).join('') + '</tr>').join('') :
    '<tr><td colspan="' + headers.length + '" class="empty">' + esc(empty) + '</td></tr>') + '</tbody></table>'
  const taskRows = (items: Task[]) => items.map(t => [line(t.title), memberNames(state.members, t.assignedTo), t.priority, displayStatus(t, now).replaceAll('_', ' '), dateText(new Date(t.dueDate))])
  const summary = overdue.length || incidents.length || critical.length
    ? 'The current operations snapshot shows ' + overdue.length + ' overdue task(s), ' + critical.length + ' high-priority active task(s), and ' + incidents.length + ' unresolved incident(s) requiring review.'
    : 'The current operations snapshot records no overdue tasks, high-priority active tasks or unresolved incidents.'
  const reportHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NHIH Weekly Operations Report</title><style>' +
    '@page{size:A4;margin:18mm 16mm 19mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#233446;margin:0;font-size:11px;line-height:1.5}' +
    '.mast{border-top:9px solid #164b72;padding-top:19px}.kicker{color:#52738a;text-transform:uppercase;letter-spacing:1.5px;font-size:10px;font-weight:700}' +
    'h1{font-size:26px;color:#123d5d;margin:10px 0 4px}h2{font-size:15px;color:#164b72;margin:25px 0 10px;border-bottom:1px solid #d9e3ea;padding-bottom:7px}' +
    '.sub{color:#657789;font-size:12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:20px 0 22px;padding:14px;background:#f2f6f9;border-radius:5px}' +
    '.meta b{display:block;color:#24445d;font-size:10px;text-transform:uppercase;letter-spacing:.6px}.score{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}' +
    '.score div{background:#f1f6fa;border:1px solid #dce7ee;padding:12px}.score strong{display:block;font-size:22px;color:#164b72}.score span{font-size:10px;color:#526778}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed;margin:8px 0 15px;font-size:10px}th{text-align:left;background:#164b72;color:white;font-weight:700;padding:8px 7px}' +
    'td{border-bottom:1px solid #e0e7ec;padding:8px 7px;overflow-wrap:anywhere;vertical-align:top}tr:nth-child(even) td{background:#f6f9fb}' +
    '.empty{color:#738493;font-style:italic}.note{background:#f6f9fb;border-left:3px solid #5489a8;padding:11px 13px}.write{min-height:70px;border:1px dashed #cbd6df;padding:10px;color:#85929c}' +
    '.sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:25px}.sign div{border-top:1px solid #9cadba;padding-top:8px;color:#6a7b88}' +
    '.foot{margin-top:25px;padding-top:10px;border-top:1px solid #d6e0e8;color:#758592;font-size:9px}' +
    '.toolbar{padding:12px 16px;background:#eaf1f6;display:flex;justify-content:space-between;gap:12px;align-items:center}.toolbar button{background:#164b72;color:white;border:0;border-radius:6px;padding:10px 14px;font-weight:700}' +
    '.page{max-width:850px;margin:auto;padding:20px 30px}@media print{.toolbar{display:none}.page{padding:0;max-width:none}h2,tr,.score div{break-inside:avoid}thead{display:table-header-group}}' +
    '</style></head><body><div class="toolbar"><span>Report preview · Review and use Print / Save as PDF</span><button onclick="window.print()">Print / Save as PDF</button></div><main class="page">' +
    '<div class="mast"><div class="kicker">Ministry of Health · National Health Information Hub (NHIH)</div><h1>Weekly Operations &amp; Intelligence Report</h1><div class="sub">Operations Management | Reporting and Performance Review</div></div>' +
    '<div class="meta"><div><b>Reporting period</b>' + esc(dateText(weekStart) + ' – ' + dateText(weekEndLabel)) + '</div><div><b>Prepared by</b>Operations Manager, NHIH</div>' +
    '<div><b>Generated on</b>' + esc(now.toLocaleString('en-GB')) + '</div><div><b>Report status</b>Draft · For review</div></div>' +
    '<h2>01 · Executive Summary</h2><p>' + esc(summary) + ' During this reporting week, ' + completed.length + ' task(s) were marked completed, ' + newTasks.length + ' task(s) were created, ' + weekMeetings.length + ' meeting(s) and ' + weekActivities.length + ' activity record(s) were logged.</p>' +
    '<div class="note">This is an automated snapshot of dashboard records, not a verified account of all work performed. Figures and commentary should be reviewed before circulation.</div>' +
    '<h2>02 · Operational Performance Scorecard</h2><div class="score">' +
    [['New tasks',newTasks.length],['Completed this week',completed.length],['Active tasks',open.length],['Overdue tasks',overdue.length],['High-priority active',critical.length],['Open actions',actions.length]].map(([k,v]) => '<div><strong>' + v + '</strong><span>' + esc(k) + '</span></div>').join('') + '</div>' +
    '<h2>03 · Activities and Achievements</h2><p><b>Completed tasks recorded this week</b></p>' +
    table(['Deliverable / task','Responsible officer','Completion date'],completed.map(t => [line(t.title),memberNames(state.members,t.assignedTo),t.completedAt ? dateText(new Date(t.completedAt)) : 'Not recorded']),'No completed tasks recorded for this week.') +
    '<p><b>Meetings and activities</b></p>' +
    table(['Type','Title','Date'],[...weekMeetings.map(m => ['Meeting',line(m.title),dateText(new Date(m.startTime))]),...weekActivities.map(a => ['Activity',line(a.title),dateText(new Date(a.startTime))])],'No meetings or activities recorded this week.') +
    '<h2>04 · Challenges, Risks and Incidents</h2>' +
    table(['Incident / issue','Date logged','Status'],weekIncidents.map(e => [line(e.title),dateText(new Date(e.at)),e.status ?? 'open']),'No incidents logged this week.') +
    '<p><b>Currently overdue or high-priority tasks</b></p>' +
    table(['Task','Owner','Priority','Status','Due date'],taskRows(attention),'No immediate priority items recorded.') +
    '<h2>05 · Outstanding Actions & Follow-ups</h2>' +
    table(['Action','Responsible officer','Status','Deadline'],actions.map(a => [line(a.title),memberNames(state.members,a.assignedTo),a.status,a.deadline ? dateText(new Date(a.deadline)) : 'Not recorded']),'No open action items recorded.') +
    '<h2>06 · Priorities for the Coming Week</h2><div class="write">Management priorities and planned actions (complete after review):</div>' +
    '<h2>07 · Management Remarks & Recommendations</h2><div class="write">Management observations, support required and recommendations:</div>' +
    '<div class="sign"><div>Prepared by · Operations Manager</div><div>Reviewed / Approved by · Name, title and date</div></div>' +
    '<div class="foot">NHIH Operations Dashboard · Generated from current live records · Internal working draft</div></main></body></html>'

  const download = () => {
    if (!connected) return
    const blob = new Blob([reportHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'NHIH_Weekly_Operations_Report_' + weekStart.getFullYear() + '-' + String(weekStart.getMonth() + 1).padStart(2,'0') + '-' + String(weekStart.getDate()).padStart(2,'0') + '.html'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="mobile-ops-intelligence" aria-label="Daily operations intelligence">
    <div className="mobile-ops-section-head">
      <h2>Daily operations briefing</h2>
      <button type="button" onClick={() => setShowBrief(v => !v)} aria-expanded={showBrief}>{showBrief ? 'Collapse' : 'Expand'}</button>
    </div>
    {showBrief && <>
      <p className="mobile-ops-brief-lead">{overdue.length || critical.length || incidents.length ? 'Attention required: review overdue work, high-priority tasks and unresolved incidents.' : 'No overdue tasks, high-priority tasks or open incidents are currently recorded.'}</p>
      <div className="mobile-ops-alerts">
        <button type="button" onClick={() => onOpen('update')}><strong>{overdue.length}</strong><span>Overdue tasks</span></button>
        <button type="button" onClick={() => onOpen('update')}><strong>{critical.length}</strong><span>High-priority tasks</span></button>
        <button type="button" onClick={() => onOpen('log')}><strong>{incidents.length}</strong><span>Unresolved incidents</span></button>
        <button type="button" onClick={() => onOpen('action')}><strong>{actions.length}</strong><span>Pending follow-ups</span></button>
      </div>
      <p className="mobile-ops-brief-meta">Due today: <strong>{dueToday.length}</strong> · Upcoming/live meetings today: <strong>{meetings.length}</strong></p>
      <h3>Priority follow-ups</h3>
      {attention.length ? attention.map(t => <div className="mobile-ops-item" key={t.id}><div><strong>{t.title}</strong><small>{memberNames(state.members, t.assignedTo)}</small></div><button type="button" onClick={() => onOpen('update')}>Follow up</button></div>) : <p className="mobile-ops-empty">No immediate task follow-ups recorded.</p>}
    </>}
    <div className="mobile-ops-report">
      <div><h3>Weekly operations summary</h3><p>{dateText(weekStart)} – {dateText(weekEndLabel)} · Download a formatted A4 report; open it in your browser to print or save as PDF.</p></div>
      <button type="button" onClick={download} disabled={!connected} title={!connected ? 'Reconnect to refresh the data before exporting' : 'Download report draft'}>Download formatted report</button>
    </div>
    {!connected && <p className="mobile-ops-empty">Report export is disabled until the live connection is restored.</p>}
  </section>
}
