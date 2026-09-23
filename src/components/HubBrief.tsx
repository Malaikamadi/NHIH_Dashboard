import { districtLabel, logKindLabel } from '../data/catalog'
import { EMR_GO_LIVE, emrRemaining } from '../data/emr'
import { FlipValue } from './FlipClock'
import { StatusPill } from './Header'
import type { HubLogKind } from '../types'
import {
  activeHubLog,
  boardWeekAnchor,
  currentOrNextMeeting,
  hubLogStatus,
  meetingStatus,
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
  onOpenEmr,
}: {
  now: Date
  onOpenMeetings: () => void
  onOpenActivities?: () => void
  onOpenEmr?: () => void
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
  const openLogs = activeHubLog(state.hubLog)
  const remaining = emrRemaining(EMR_GO_LIVE, now)
  const countdownUnits = [
    { value: String(remaining.days), label: 'Days' },
    { value: String(remaining.hours).padStart(2, '0'), label: 'Hrs' },
    { value: String(remaining.minutes).padStart(2, '0'), label: 'Min' },
    { value: String(remaining.seconds).padStart(2, '0'), label: 'Sec' },
  ]

  return (
    <div className={`hub-brief-stack ${openLogs.length ? 'has-pipe' : ''}`}>
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
        <button type="button" className="brief-emr" onClick={onOpenEmr} disabled={!onOpenEmr}>
          <span className="brief-kicker">EMR Launch</span>
          <span className="brief-emr-clock" role="timer" aria-label="EMR go-live countdown">
            {countdownUnits.map((unit) => (
              <span key={unit.label} className="brief-emr-unit" aria-label={`${unit.value} ${unit.label}`}>
                <FlipValue value={unit.value} />
                <small>{unit.label}</small>
              </span>
            ))}
          </span>
        </button>
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

      {openLogs.length > 0 && (
        <div className="brief-pipe-stack" aria-label="Open hub incidents">
          {openLogs.map((entry) => (
            <a key={entry.id} href="#hub-log" className={`brief-pipe-card is-${entry.kind}`}>
              <span className="brief-pipe-kicker">
                <Icon name={pipeIcon(entry.kind)} size={14} />
                Hub incident log
              </span>
              <strong>{logKindLabel(entry.kind)}</strong>
              <p>{entry.title}</p>
              <span className="brief-pipe-meta">
                {isSameDay(new Date(entry.at), now)
                  ? formatTime(entry.at)
                  : `${formatDate(entry.at)} · ${formatTime(entry.at)}`}
                {` · ${districtLabel(entry.district)}`}
                {entry.facility ? ` · ${entry.facility}` : ''}
              </span>
              <StatusPill status={hubLogStatus(entry)} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function pipeIcon(kind: HubLogKind) {
  if (kind === 'extract_restored') return 'check' as const
  if (kind === 'extract_failed' || kind === 'incident') return 'alert' as const
  return 'clipboard' as const
}
