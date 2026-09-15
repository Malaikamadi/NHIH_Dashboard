import { useEffect, useRef, useState } from 'react'
import { useOps } from '../store/OpsContext'
import type { TaskStatus } from '../types'
import { currentOrNextMeeting, meetingStatus, startingSoon } from '../utils/metrics'
import { countdown, formatClock, formatLongDate, formatTime } from '../utils/time'
import mohsLogo from '../assets/mohs-logo.jpg'
import { Icon } from './Icons'

interface Props {
  onMenu: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function Header({ onMenu, theme, onToggleTheme }: Props) {
  const { state, connected } = useOps()
  const [now, setNow] = useState(() => new Date())
  const [alertsOpen, setAlertsOpen] = useState(false)
  const alertRef = useRef<HTMLDivElement>(null)
  const operator = state.members.find((m) => m.role === 'Operations Manager')
  const soon = startingSoon(state.meetings, state.activities, now)

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!alertsOpen) return
    const onClick = (event: MouseEvent) => {
      if (!alertRef.current?.contains(event.target as Node)) setAlertsOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [alertsOpen])

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="icon-btn" onClick={onMenu} aria-label="Toggle menu">
          <Icon name="menu" size={20} />
        </button>
        <img
          className="topbar-logo"
          src={mohsLogo}
          alt="Ministry of Health, Government of Sierra Leone"
        />
        <div>
          <h1>Team Operations Dashboard</h1>
          <p>Together we build better data</p>
        </div>
      </div>

      <div className="topbar-when">
        <Icon name="calendar" size={16} />
        <div>
          <strong>{formatClock(now)}</strong>
          <span>{formatLongDate(now)}</span>
        </div>
        <LiveMeetingChip now={now} soonCount={soon.length} />
      </div>

      <div className="topbar-right">
        <span className={`live-chip ${connected ? '' : 'is-off'}`}>
          <span className="pulse" />
          {connected ? 'Live' : 'Connecting'}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        <div className="alert-wrap" ref={alertRef}>
          <button
            type="button"
            className={`icon-btn ${soon.length ? 'has-alert' : ''}`}
            aria-label="Upcoming alerts"
            aria-expanded={alertsOpen}
            onClick={() => setAlertsOpen((open) => !open)}
          >
            <Icon name="bell" size={18} />
            {soon.length > 0 && <em>{Math.min(soon.length, 9)}</em>}
          </button>
          {alertsOpen && (
            <div className="alert-menu">
              <strong>Starting within 30 minutes</strong>
              {soon.length === 0 && <p className="muted">No meetings or activities in the next 30 minutes.</p>}
              {soon.map((item) => (
                <p key={item.id}>
                  <em>{item.kind === 'meeting' ? 'Meeting' : 'Activity'}</em>
                  {item.title}
                  <span>Starts in {countdown(item.startTime, now)} · {formatTime(item.startTime)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
        <span className="topbar-user">
          <span className="avatar">{operator?.initials ?? 'PM'}</span>
          <span>{operator?.name ?? 'Prince Mafinda'}</span>
        </span>
      </div>
    </header>
  )
}

function LiveMeetingChip({ now, soonCount }: { now: Date; soonCount: number }) {
  const { state } = useOps()
  const focus = currentOrNextMeeting(state.meetings, now)
  if (!focus) return null
  const live = meetingStatus(focus, now) === 'live'
  const soon = !live && soonCount > 0 && startingSoon([focus], [], now).length > 0
  return (
    <span className={`meet-chip ${live ? 'is-live' : ''} ${soon ? 'is-soon' : ''}`}>
      <Icon name="calendar" size={14} />
      {live ? 'Live' : soon ? `In ${countdown(focus.startTime, now)}` : 'Next'} · {focus.title}
    </span>
  )
}

export function StatusPill({ status }: { status: TaskStatus | 'upcoming' | 'live' | 'open' | 'ongoing' }) {
  const labels: Record<string, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    under_review: 'Under Review',
    completed: 'Completed',
    overdue: 'Overdue',
    upcoming: 'Upcoming',
    live: 'Live',
    ongoing: 'Ongoing',
    open: 'Open',
  }
  return <span className={`pill pill-${status}`}>{labels[status] ?? status}</span>
}

export function PriorityMark({ priority }: { priority: 'high' | 'medium' | 'low' | 'critical' }) {
  const band = priority === 'critical' ? 'high' : priority
  return <span className={`prio prio-${band}`}>{band}</span>
}

export function Avatar({ name, initials }: { name: string; initials: string; index?: number }) {
  return (
    <span className="avatar" title={name}>
      {initials}
    </span>
  )
}
