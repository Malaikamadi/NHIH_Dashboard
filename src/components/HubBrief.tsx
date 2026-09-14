import { logKindLabel } from '../data/catalog'
import {
  currentOrNextMeeting,
  dueTodayTasks,
  hotspotDistrict,
  meetingStatus,
  overdueTasks,
  pipeStatus,
  todaysMeetings,
} from '../utils/metrics'
import { countdown, formatTime } from '../utils/time'
import { useOps } from '../store/OpsContext'
import { StatusPill } from './Header'

export function HubBrief({
  now,
  onOpenMeetings,
  onOpenOverdue,
}: {
  now: Date
  onOpenMeetings: () => void
  onOpenOverdue?: () => void
}) {
  const { state } = useOps()
  const today = todaysMeetings(state.meetings, now)
  const focus = currentOrNextMeeting(state.meetings, now)
  const live = Boolean(focus && meetingStatus(focus, now) === 'live')
  const overdue = overdueTasks(state.tasks, now).length
  const dueToday = dueTodayTasks(state.tasks, now).length
  const hotspot = hotspotDistrict(state.tasks, now)
  const pipe = pipeStatus(state.hubLog, now)

  return (
    <section className={`hub-brief ${live ? 'is-live' : ''}`}>
      <button type="button" className="brief-focus" onClick={onOpenMeetings}>
        <span className={`brief-kicker ${live ? 'is-live' : ''}`}>
          {live ? 'Live now' : focus ? 'Up next' : 'Agenda'}
        </span>
        <strong>{focus ? focus.title : 'No remaining meetings today'}</strong>
        <span className="muted">
          {focus
            ? `${formatTime(focus.startTime)} – ${formatTime(focus.endTime)} · ${
                live ? `${countdown(focus.endTime, now)} remaining` : `starts in ${countdown(focus.startTime, now)}`
              }`
            : 'Add a meeting to put the hub day on the board'}
        </span>
      </button>
      <div className="brief-stats">
        <div>
          <strong>{today.length}</strong>
          <span>Meetings</span>
        </div>
        <div>
          <strong>{dueToday}</strong>
          <span>Due today</span>
        </div>
        <button
          type="button"
          className={overdue ? 'is-late' : ''}
          onClick={onOpenOverdue}
          disabled={!onOpenOverdue}
        >
          <strong>{overdue}</strong>
          <span>
            {hotspot ? `${hotspot.label} still open` : overdue ? 'Overdue' : 'Clear'}
          </span>
        </button>
      </div>
      {pipe && (
        <p className={`brief-pipe is-${pipe.kind}`}>
          {logKindLabel(pipe.kind)} · {pipe.title}
        </p>
      )}
      {today.length > 0 && (
        <ol className="agenda-strip">
          {today.map((meeting) => {
            const status = meetingStatus(meeting, now)
            return (
              <li key={meeting.id} className={`agenda-item is-${status}`}>
                <span>{formatTime(meeting.startTime)}</span>
                <em>{meeting.title}</em>
                <StatusPill status={status === 'live' ? 'ongoing' : status} />
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
