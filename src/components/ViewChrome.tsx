import { useEffect, useState } from 'react'
import { currentOrNextMeeting, meetingStatus } from '../utils/metrics'
import { countdown, formatTime } from '../utils/time'
import { useOps } from '../store/OpsContext'

interface Props {
  progress: number
  paused: boolean
  onTogglePause: () => void
}

export function ViewChrome({ progress, paused, onTogglePause }: Props) {
  const { state } = useOps()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const next = currentOrNextMeeting(state.meetings, now)
  const live = next && meetingStatus(next, now) === 'live'
  const remaining = Math.max(1, Math.ceil((1 - progress) * 25))

  return (
    <footer className="slim-foot">
      <span>Live updates · Last updated {formatTime(now.toISOString())}</span>
      <button type="button" onClick={onTogglePause}>
        {paused ? 'Auto-rotate off' : `Auto-rotating · next view in ${remaining}s`}
      </button>
      <strong className={live ? 'is-live' : ''}>
        {next
          ? `${live ? 'Live' : 'Next'}: ${next.title} · ${countdown(live ? next.endTime : next.startTime, now)}`
          : 'No remaining meetings'}
      </strong>
    </footer>
  )
}
