import { useMemo } from 'react'
import { Avatar, StatusPill } from '../components/Header'
import { PlaceLine } from '../components/PlaceFields'
import { useOps } from '../store/OpsContext'
import type { ActionStatus } from '../types'
import { memberIndex, memberName, openActionItems } from '../utils/metrics'
import { formatDue } from '../utils/time'

const ACTION_STATUS: Record<ActionStatus, 'open' | 'in_progress' | 'completed'> = {
  open: 'open',
  in_progress: 'in_progress',
  completed: 'completed',
}

export function ActionItemsView() {
  const { state, convertActionToTask } = useOps()
  const now = useMemo(() => new Date(), [state.actionItems, state.tasks])
  const items = openActionItems(state.actionItems)
  const open = items.filter((i) => i.status !== 'completed').length
  const converted = items.filter((i) => i.convertedToTaskId).length
  const leadId = state.members.find((m) => m.role === 'Team Lead')?.id ?? 'm1'

  return (
    <div className="view actions-view">
      <section className="metric-strip">
        <article className="metric">
          <div className="metric-label">Action Items</div>
          <div className="metric-value">{items.length}</div>
          <div className="metric-hint">From recent meetings</div>
        </article>
        <article className={`metric ${open ? 'tone-warn' : 'tone-ok'}`}>
          <div className="metric-label">Still Open</div>
          <div className="metric-value">{open}</div>
          <div className="metric-hint">Need owners to close</div>
        </article>
        <article className="metric tone-ok">
          <div className="metric-label">Converted to Tasks</div>
          <div className="metric-value">{converted}</div>
          <div className="metric-hint">Now tracked on the board</div>
        </article>
      </section>

      <section className="panel">
        <header className="panel-h">
          <h2>Meeting Action Points</h2>
          <span className="panel-note">Assigned owners, deadlines, and conversion status</span>
        </header>
        <div className="action-table">
          <div className="action-head">
            <span>Action</span>
            <span>Meeting</span>
            <span>Owner</span>
            <span>Deadline</span>
            <span>Status</span>
            <span>Task</span>
          </div>
          {items.map((item) => {
            const overdue = item.status !== 'completed' && new Date(item.deadline) < now
            return (
              <div key={item.id} className={`action-row ${overdue ? 'is-late' : ''}`}>
                <div className="action-title">
                  {item.title}
                  <PlaceLine workKind={item.workKind} district={item.district} facility={item.facility} />
                </div>
                <div className="muted">{item.meetingTitle}</div>
                <div className="task-meta">
                  <Avatar
                    name={memberName(state.members, item.assignedTo)}
                    initials={
                      state.members.find((m) => m.id === item.assignedTo)?.initials ?? '?'
                    }
                    index={memberIndex(state.members, item.assignedTo)}
                  />
                  {memberName(state.members, item.assignedTo)}
                </div>
                <div className={overdue ? 'warn-text' : ''}>{formatDue(item.deadline, now)}</div>
                <StatusPill status={ACTION_STATUS[item.status]} />
                <div>
                  {item.convertedToTaskId ? (
                    <span className="pill pill-completed">On board</span>
                  ) : (
                    <button
                      type="button"
                      className="convert-btn"
                      onClick={() => convertActionToTask(item.id, leadId)}
                    >
                      Convert to task
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
