import { useEffect, useState } from 'react'
import { OpsIntelligence } from './OpsIntelligence'
import { useOps } from '../store/OpsContext'
import { displayStatus, memberNames, meetingStatus, priorityTasks, todaysMeetings } from '../utils/metrics'

type DeskTab = 'task' | 'update' | 'meeting' | 'activity' | 'action' | 'log' | 'emr'

export function MobileOpsHome({ onOpen }: { onOpen: (tab: DeskTab) => void }) {
  const { state, connected } = useOps()
  const [hasConnected, setHasConnected] = useState(connected)
  useEffect(() => { if (connected) setHasConnected(true) }, [connected])
  const now = new Date()
  const active = state.tasks.filter(t => displayStatus(t, now) !== 'completed')
  const overdue = active.filter(t => displayStatus(t, now) === 'overdue')
  const urgent = active.filter(t => t.priority === 'critical' || t.priority === 'high')
  const actions = state.actionItems.filter(a => a.status !== 'completed')
  const incidents = state.hubLog.filter(h => h.kind === 'incident' && h.status !== 'completed')
  const meetings = todaysMeetings(state.meetings, now).filter(m => meetingStatus(m, now) !== 'completed')
  const priorities = priorityTasks(state.tasks, now, 4)
  const date = new Intl.DateTimeFormat('en-SL', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  return (
    <main className="mobile-ops-home">
      <div className="mobile-ops-intro">
        <span className="mobile-ops-eyebrow">OPERATIONS OVERVIEW · {date}</span>
        <h1>Today's command centre</h1>
        <p>Live priorities, follow-ups and operational incidents from the NHIH dashboard.</p>
        <span className={'mobile-ops-connection ' + (connected ? 'is-connected' : '')}>{connected ? '● Live connection' : hasConnected ? '● Connection unavailable — figures may be stale' : '● Connecting…'}</span>
      </div>
      <div className="mobile-ops-stats" aria-label="Operational summary">
        <div><span>Active tasks</span><strong>{active.length}</strong></div>
        <div><span>Overdue</span><strong>{overdue.length}</strong></div>
        <div><span>High priority</span><strong>{urgent.length}</strong></div>
        <div><span>Open actions</span><strong>{actions.length}</strong></div>
      </div>
      <OpsIntelligence onOpen={onOpen} />
      <section className="mobile-ops-section"><div className="mobile-ops-section-head"><h2>Quick commands</h2></div>
        <div className="mobile-ops-shortcuts">
          <button type="button" onClick={() => onOpen('task')}>＋ Assign task</button>
          <button type="button" onClick={() => onOpen('update')}>↗ Update tasks</button>
          <button type="button" onClick={() => onOpen('meeting')}>＋ Add meeting</button>
          <button type="button" onClick={() => onOpen('log')}>＋ Record incident</button>
        </div>
      </section>
      <section className="mobile-ops-section"><div className="mobile-ops-section-head"><h2>Needs your attention</h2><button type="button" onClick={() => onOpen('update')}>Manage tasks</button></div>
        {priorities.length === 0 ? <p className="mobile-ops-empty">No outstanding tasks recorded.</p> : priorities.map(task => (
          <div className="mobile-ops-item" key={task.id}>
            <div><strong>{task.title}</strong><small>{memberNames(state.members, task.assignedTo)}</small></div>
            <span className={displayStatus(task, now) === 'overdue' ? 'is-urgent' : ''}>{displayStatus(task, now) === 'overdue' ? 'Overdue' : task.priority + ' priority'}</span>
          </div>
        ))}
      </section>
      <section className="mobile-ops-section"><div className="mobile-ops-section-head"><h2>Incidents & follow-ups</h2><button type="button" onClick={() => onOpen('log')}>Open incident log</button></div>
        <div className="mobile-ops-mini"><span>Open incidents</span><strong>{incidents.length}</strong></div>
        <div className="mobile-ops-mini"><span>Pending action items</span><strong>{actions.length}</strong></div>
        <button type="button" className="mobile-ops-secondary" onClick={() => onOpen('action')}>Manage action items</button>
      </section>
      <section className="mobile-ops-section"><div className="mobile-ops-section-head"><h2>Today's meetings</h2><button type="button" onClick={() => onOpen('meeting')}>Manage meetings</button></div>
        {meetings.length === 0 ? <p className="mobile-ops-empty">No upcoming or live meetings recorded for today.</p> : meetings.slice(0,4).map(m => <div className="mobile-ops-item" key={m.id}><div><strong>{m.title}</strong><small>{new Date(m.startTime).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</small></div><span>{meetingStatus(m,now)}</span></div>)}
      </section>
      <button type="button" className="mobile-ops-full" onClick={() => onOpen('task')}>Open full Command Desk</button>
    </main>
  )
}
