import { districtLabel, logKindLabel } from '../data/catalog'
import type { HubLogKind } from '../types'
import {
  currentOrNextMeeting,
  dueTodayTasks,
  hotspotDistrict,
  meetingStatus,
  openTodayActivities,
  openWeekMeetings,
  overdueTasks,
  pipeStatus,
  weeksMeetings,
} from '../utils/metrics'
import { countdown, formatTime, isSameDay, weekDays } from '../utils/time'
import { useOps } from '../store/OpsContext'
import { Icon } from './Icons'

export function HubBrief({
  now,
  onOpenMeetings,
  onOpenActivities,
  onOpenOverdue,
}: {
  now: Date
  onOpenMeetings: () => void
  onOpenActivities?: () => void
  onOpenOverdue?: () => void
}) {
  const { state } = useOps()
  const today = openWeekMeetings(state.meetings, now)
  const weekMeetings = weeksMeetings(state.meetings, now)
  const weekdays = weekDays(now).slice(0, 5)
  const activities = openTodayActivities(state.activities, now)
  const focus = currentOrNextMeeting(state.meetings, now)
  const live = Boolean(focus && meetingStatus(focus, now) === 'live')
  const overdue = overdueTasks(state.tasks, now).length
  const dueToday = dueTodayTasks(state.tasks, now).length
  const hotspot = hotspotDistrict(state.tasks, now)
  const pipe = pipeStatus(state.hubLog, now)

  return (
    <div className={`hub-brief-stack ${pipe ? 'has-pipe' : ''}`}>
      <section className={`hub-brief ${live ? 'is-live' : ''}`}>
        <button type="button" className="brief-focus" onClick={onOpenMeetings}>
          <span className={`brief-kicker ${live ? 'is-live' : ''}`}>
            {live ? 'Live meeting' : focus ? 'Next meeting' : 'Meetings'}
          </span>
          <strong>{focus ? focus.title : 'No remaining meetings this week'}</strong>
          <span className="muted">
            {focus
              ? `${formatTime(focus.startTime)} – ${formatTime(focus.endTime)} · ${
                  live ? `${countdown(focus.endTime, now)} remaining` : `starts in ${countdown(focus.startTime, now)}`
                }`
              : 'Mon–Fri meetings sit in the strip below'}
          </span>
        </button>
        <div className="brief-stats">
          <div>
            <strong>{today.length}</strong>
            <span>This week</span>
          </div>
          <button type="button" onClick={onOpenActivities} disabled={!onOpenActivities}>
            <strong>{activities.length}</strong>
            <span>Activities</span>
          </button>
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
        <ol className="week-strip" aria-label="Meetings Monday to Friday">
          {weekdays.map((day) => {
            const items = weekMeetings.filter((meeting) => isSameDay(new Date(meeting.startTime), day))
            return (
              <li key={day.toISOString()} className={isSameDay(day, now) ? 'is-today' : ''}>
                <span>
                  {day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                </span>
                {items.length === 0 ? (
                  <em className="week-empty">—</em>
                ) : (
                  items.map((meeting) => {
                    const status = meetingStatus(meeting, now)
                    return (
                      <button
                        key={meeting.id}
                        type="button"
                        className={`week-meet is-${status}`}
                        onClick={onOpenMeetings}
                      >
                        <b>{formatTime(meeting.startTime)}</b>
                        {meeting.title}
                      </button>
                    )
                  })
                )}
              </li>
            )
          })}
        </ol>
      </section>

      {pipe && (
        <a href="#hub-log" className={`brief-pipe-card is-${pipe.kind}`}>
          <span className="brief-pipe-kicker">
            <Icon name={pipeIcon(pipe.kind)} size={14} />
            Hub incident log
          </span>
          <strong>{logKindLabel(pipe.kind)}</strong>
          <p>{pipe.title}</p>
          <span className="brief-pipe-meta">
            {formatTime(pipe.at)}
            {` · ${districtLabel(pipe.district)}`}
            {pipe.facility ? ` · ${pipe.facility}` : ''}
          </span>
        </a>
      )}
    </div>
  )
}

function pipeIcon(kind: HubLogKind) {
  if (kind === 'extract_restored') return 'check' as const
  if (kind === 'extract_failed' || kind === 'incident') return 'alert' as const
  return 'clipboard' as const
}
