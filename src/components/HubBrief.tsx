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
  weeksActivities,
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
  const weekMeetings = weeksMeetings(state.meetings, now)
  const weekActivities = weeksActivities(state.activities, now)
  const openMeetings = openWeekMeetings(state.meetings, now)
  const weekdays = weekDays(now).slice(0, 5)
  const activitiesToday = openTodayActivities(state.activities, now)
  const meetingFocus = currentOrNextMeeting(state.meetings, now)
  const activityFocus = weekActivities.find((item) => meetingStatus(item, now) === 'live')
    ?? weekActivities.find((item) => meetingStatus(item, now) === 'upcoming')
  const liveMeeting = Boolean(meetingFocus && meetingStatus(meetingFocus, now) === 'live')
  const liveActivity = Boolean(activityFocus && meetingStatus(activityFocus, now) === 'live')
  const focus =
    liveMeeting && meetingFocus
      ? { kind: 'meeting' as const, item: meetingFocus }
      : liveActivity && activityFocus
        ? { kind: 'activity' as const, item: activityFocus }
        : meetingFocus
          ? { kind: 'meeting' as const, item: meetingFocus }
          : activityFocus
            ? { kind: 'activity' as const, item: activityFocus }
            : null
  const live = focus ? meetingStatus(focus.item, now) === 'live' : false
  const overdue = overdueTasks(state.tasks, now).length
  const dueToday = dueTodayTasks(state.tasks, now).length
  const hotspot = hotspotDistrict(state.tasks, now)
  const pipe = pipeStatus(state.hubLog, now)
  const weekOpen = openMeetings.length + weekActivities.filter((item) => meetingStatus(item, now) !== 'completed').length

  return (
    <div className={`hub-brief-stack ${pipe ? 'has-pipe' : ''}`}>
      <section className={`hub-brief ${live ? 'is-live' : ''}`}>
        <button
          type="button"
          className="brief-focus"
          onClick={focus?.kind === 'activity' ? onOpenActivities : onOpenMeetings}
        >
          <span className={`brief-kicker ${live ? 'is-live' : ''}`}>
            {live
              ? focus?.kind === 'activity'
                ? 'Live activity'
                : 'Live meeting'
              : focus
                ? focus.kind === 'activity'
                  ? 'Next activity'
                  : 'Next meeting'
                : 'This week'}
          </span>
          <strong>{focus ? focus.item.title : 'No remaining meetings or activities this week'}</strong>
          <span className="muted">
            {focus
              ? `${formatTime(focus.item.startTime)} – ${formatTime(focus.item.endTime)} · ${
                  live
                    ? `${countdown(focus.item.endTime, now)} remaining`
                    : `starts in ${countdown(focus.item.startTime, now)}`
                }`
              : 'Mon–Fri meetings and activities sit in the strip below'}
          </span>
        </button>
        <div className="brief-stats">
          <div>
            <strong>{weekOpen}</strong>
            <span>This week</span>
          </div>
          <button type="button" onClick={onOpenActivities} disabled={!onOpenActivities}>
            <strong>{activitiesToday.length}</strong>
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
        <ol className="week-strip" aria-label="Meetings and activities Monday to Friday">
          {weekdays.map((day) => {
            const items = [
              ...weekMeetings
                .filter((meeting) => isSameDay(new Date(meeting.startTime), day))
                .map((meeting) => ({ ...meeting, kind: 'meeting' as const })),
              ...weekActivities
                .filter((activity) => isSameDay(new Date(activity.startTime), day))
                .map((activity) => ({ ...activity, kind: 'activity' as const })),
            ].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
            return (
              <li key={day.toISOString()} className={isSameDay(day, now) ? 'is-today' : ''}>
                <span>
                  {day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                </span>
                {items.length === 0 ? (
                  <em className="week-empty">—</em>
                ) : (
                  items.map((item) => {
                    const status = meetingStatus(item, now)
                    return (
                      <button
                        key={`${item.kind}-${item.id}`}
                        type="button"
                        className={`week-meet is-${item.kind} is-${status}`}
                        onClick={item.kind === 'activity' ? onOpenActivities : onOpenMeetings}
                      >
                        <b>
                          {formatTime(item.startTime)}
                          <i>{item.kind === 'activity' ? 'Activity' : 'Meeting'}</i>
                        </b>
                        {item.title}
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
