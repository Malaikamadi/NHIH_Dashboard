import { useState } from 'react'
import { useOps } from '../store/OpsContext'
import { displayStatus, memberNames, meetingStatus } from '../utils/metrics'
import type { Task } from '../types'

type DeskTab = 'task' | 'update' | 'meeting' | 'activity' | 'action' | 'log' | 'emr'
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

  const taskLine = (t: Task) => '- ' + line(t.title) + ' | ' + displayStatus(t, now) + ' | ' + t.priority + ' | Owner: ' + memberNames(state.members, t.assignedTo) + ' | Due: ' + dateText(new Date(t.dueDate))
  const report = [
    'NHIH WEEKLY OPERATIONS SUMMARY',
    'Reporting period: ' + dateText(weekStart) + ' – ' + dateText(weekEndLabel),
    'Generated: ' + now.toLocaleString('en-GB'),
    '',
    '1. EXECUTIVE SNAPSHOT',
    'New tasks this week: ' + newTasks.length,
    'Tasks completed this week: ' + completed.length,
    'Active tasks (current): ' + open.length,
    'Overdue tasks (current): ' + overdue.length,
    'Open action items (current): ' + actions.length,
    'Open incidents (current): ' + incidents.length,
    '',
    '2. KEY PRIORITIES AND FOLLOW-UPS',
    ...(attention.length ? attention.map(taskLine) : ['No urgent task items recorded.']),
    '',
    '3. MEETINGS AND ACTIVITIES THIS WEEK',
    'Meetings: ' + weekMeetings.length,
    ...weekMeetings.map(m => '- ' + line(m.title) + ' (' + dateText(new Date(m.startTime)) + ')'),
    'Activities: ' + weekActivities.length,
    ...weekActivities.map(a => '- ' + line(a.title) + ' (' + dateText(new Date(a.startTime)) + ')'),
    '',
    '4. INCIDENTS LOGGED THIS WEEK',
    ...(weekIncidents.length ? weekIncidents.map(e => '- ' + line(e.title) + ' | ' + (e.status ?? 'open')) : ['No incidents logged this week.']),
    '',
    '5. FOLLOW-UP REQUIRED',
    ...(actions.length ? actions.slice(0, 12).map(a => '- ' + line(a.title) + ' | ' + a.status + ' | Owner: ' + memberNames(state.members, a.assignedTo)) : ['No outstanding action items.']),
    '',
    'Prepared automatically from the current NHIH Operations Dashboard snapshot.',
    'Review and validate figures and narrative before sharing.'
  ].join('\n')

  const download = () => {
    if (!connected) return
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'NHIH_Weekly_Operations_' + weekStart.toISOString().slice(0,10) + '.txt'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
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
      <div><h3>Weekly operations summary</h3><p>{dateText(weekStart)} – {dateText(weekEndLabel)} · Download a draft for Friday reporting.</p></div>
      <button type="button" onClick={download} disabled={!connected} title={!connected ? 'Reconnect to refresh the data before exporting' : 'Download report draft'}>Download report</button>
    </div>
    {!connected && <p className="mobile-ops-empty">Report export is disabled until the live connection is restored.</p>}
  </section>
}
