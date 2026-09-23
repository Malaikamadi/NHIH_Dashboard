import { districtLabel, logKindLabel } from '../data/catalog'
import type { HubLogKind } from '../types'
import {
  boardWeekAnchor,
  currentOrNextMeeting,
  dueTodayTasks,
  hotspotDistrict,
  meetingStatus,
  overdueTasks,
  pipeStatus,
  recordedActivities,
  weeksActivities,
  weeksMeetings,
} from '../utils/metrics'
import { countdown, formatDate, formatDayLabel, formatTime, isSameDay, startOfWeek, weekDays } from '../utils/time'
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
  const stripAnchor = boardWeekAnchor(state.meetings, state.activities, now)
  const showingPastWeek = startOfWeek(stripAnchor).getTime() !== startOfWeek(now).getTime()
  const weekMeetings = weeksMeetings(state.meetings, stripAnchor)
  const weekActivities = weeksActivities(state.activities, stripAnchor)
  const weekdays = weekDays(stripAnchor).slice(0, 5)
  const meetingFocus = currentOrNextMeeting(state.meetings, now)
  const activityFocus =
    weekActivities.find((item) => meetingStatus(item, now) === 'live') ??
    weekActivities.find((item) => meetingStatus(item, now) === 'upcoming') ??
    recordedActivities(state.activities)[0]
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
  const weekOpen = weekMeetings.length + weekActivities.length

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
                ? meetingStatus(focus.item, now) === 'upcoming'
                  ? focus.kind === 'activity'
                    ? 'Next activity'
                    : 'Next meeting'
                  : focus.kind === 'activity'
                    ? 'Last activity'
                    : 'Last meeting'
                : 'This week'}
          </span>
          <strong>{focus ? focus.item.title : 'No meetings or activities on the hub yet'}</strong>
          <span className="muted">
            {focus
              ? `${formatDayLabel(focus.item.startTime, now)} · ${formatTime(focus.item.startTime)} – ${formatTime(focus.item.endTime)} · ${
                  live
                    ? `${countdown(focus.item.endTime, now)} remaining`
                    : meetingStatus(focus.item, now) === 'upcoming'
                      ? `starts in ${countdown(focus.item.startTime, now)}`
                      : 'already on the hub'
                }`
              : showingPastWeek
                ? 'Showing the last week with recorded huddles'
                : 'Mon–Fri meetings and activities sit in the strip below'}
          </span>
        </button>
        <div className="brief-stats">
          <div>
            <strong>{weekOpen}</strong>
            <span>{showingPastWeek ? 'Last recorded' : 'This week'}</span>
          </div>
          <button type="button" onClick={onOpenActivities} disabled={!onOpenActivities}>
            <strong>{(state.activities ?? []).length}</strong>
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
                  {isSameDay(day, now)
                    ? 'Today'
                    : day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
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
            {isSameDay(new Date(pipe.at), now) ? formatTime(pipe.at) : `${formatDate(pipe.at)} · ${formatTime(pipe.at)}`}
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
