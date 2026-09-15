import { useEffect, useRef, useState } from 'react'
import { ACTIVITY_KINDS, DISTRICTS, activityKindLabel, districtLabel } from '../data/catalog'
import { useOps } from '../store/OpsContext'
import type { ActivityKind, DistrictId, MeetingStatus, TeamActivity } from '../types'
import { meetingStatus } from '../utils/metrics'
import { formatDate, formatTimeRange, nowIso, toDatetimeLocal } from '../utils/time'
import { StatusPill } from './Header'

function defaultStart(): Date {
  return new Date()
}

function defaultEnd(): Date {
  return new Date(Date.now() + 2 * 60 * 60 * 1000)
}

export function ActivityForm({
  onAdded,
}: {
  onAdded?: () => void
}) {
  const { state, addActivity } = useOps()
  const [kind, setKind] = useState<ActivityKind>('training')
  const rootRef = useRef<HTMLFormElement>(null)
  const lead = state.members.find((m) => m.role === 'Team Lead')?.id ?? state.members[0]?.id ?? ''

  useEffect(() => {
    const form = rootRef.current
    if (!form) return
    const onReset = () => setKind('training')
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [])

  return (
    <form
      ref={rootRef}
      className="meeting-composer"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        const selected = data.getAll('participants').map(String)
        const start = new Date(String(data.get('start')))
        const end = new Date(String(data.get('end')))
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
          return
        }
        const nextKind = String(data.get('kind')) as ActivityKind
        addActivity({
          title: String(data.get('title')).trim(),
          kind: nextKind,
          kindOther: nextKind === 'other' ? String(data.get('kindOther') || '').trim() : '',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          participantIds: selected.length ? selected : lead ? [lead] : [],
          district: String(data.get('district') || 'national') as DistrictId,
          facility: String(data.get('facility') || '').trim() || undefined,
          notes: String(data.get('notes') || '').trim(),
        })
        form.reset()
        onAdded?.()
      }}
    >
      <label>
        Activity
        <input name="title" required placeholder="Training, field visit, workshop…" />
      </label>
      <div className="admin-split">
        <label>
          Type
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
            {ACTIVITY_KINDS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          District
          <select name="district" defaultValue="national">
            {DISTRICTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {kind === 'other' && (
        <label>
          Other activity
          <input name="kindOther" required placeholder="Type the activity" />
        </label>
      )}
      <label>
        Place
        <input name="facility" placeholder="Venue / facility (optional)" />
      </label>
      <div className="admin-split">
        <label>
          Start
          <input name="start" type="datetime-local" required defaultValue={toDatetimeLocal(defaultStart())} />
        </label>
        <label>
          End
          <input name="end" type="datetime-local" required defaultValue={toDatetimeLocal(defaultEnd())} />
        </label>
      </div>
      <fieldset className="participant-picks">
        <legend>Who is attending</legend>
        {state.members.map((member) => (
          <label key={member.id} className="check-line">
            <input type="checkbox" name="participants" value={member.id} />
            {member.name}
          </label>
        ))}
      </fieldset>
      <label>
        Notes
        <textarea name="notes" rows={3} placeholder="Purpose, venue, or what the team is attending" />
      </label>
      <div className="meeting-composer-actions">
        <button type="submit" className="primary-btn sm">
          Add activity
        </button>
      </div>
    </form>
  )
}

function ActivityTools({
  activity,
  now,
  readOnly,
}: {
  activity: TeamActivity
  now?: Date
  readOnly?: boolean
}) {
  const { updateActivity } = useOps()
  const status: MeetingStatus = meetingStatus(activity, now)
  const [notes, setNotes] = useState(activity.notes ?? '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setNotes(activity.notes ?? '')
  }, [activity.notes])

  const startActivity = () => {
    const start = new Date()
    const currentEnd = new Date(activity.endTime)
    const minEnd = new Date(start.getTime() + 60 * 60 * 1000)
    updateActivity(activity.id, {
      startTime: start.toISOString(),
      endTime: currentEnd > minEnd ? currentEnd.toISOString() : minEnd.toISOString(),
    })
  }

  const endActivity = () => {
    updateActivity(activity.id, { endTime: nowIso() })
  }

  if (readOnly) {
    return activity.notes?.trim() ? <p className="meet-minutes">{activity.notes}</p> : null
  }

  return (
    <div className="meeting-actions">
      <div className="meeting-actions-bar">
        {status === 'upcoming' && (
          <button type="button" className="complete-btn" onClick={startActivity}>
            Start
          </button>
        )}
        {status === 'live' && (
          <button type="button" className="complete-btn" onClick={endActivity}>
            End
          </button>
        )}
        {status === 'completed' && <span className="muted">Ended</span>}
        <button type="button" className={`tool-btn ${editing ? 'is-on' : ''}`} onClick={() => setEditing((on) => !on)}>
          {activity.notes?.trim() ? 'Edit notes' : 'Add notes'}
        </button>
      </div>
      {editing && (
        <form
          className="meeting-composer"
          onSubmit={(e) => {
            e.preventDefault()
            updateActivity(activity.id, { notes: notes.trim() })
            setEditing(false)
          }}
        >
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </label>
          <div className="meeting-composer-actions">
            <button type="submit" className="primary-btn sm">
              Save notes
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export function ActivitySession({
  activity,
  now,
  readOnly,
}: {
  activity: TeamActivity
  now?: Date
  readOnly?: boolean
}) {
  const status = meetingStatus(activity, now)
  const place = [activityKindLabel(activity.kind, activity.kindOther), districtLabel(activity.district)]
  if (activity.facility) place.push(activity.facility)

  return (
    <article className="meet-block">
      <div className="data-row meet-row activity-row">
        <strong>{activity.title}</strong>
        <span>{place.join(' · ')}</span>
        <span>
          {formatDate(activity.startTime)} · {formatTimeRange(activity.startTime, activity.endTime)}
        </span>
        <span>{activity.participantIds.length} attending</span>
        <StatusPill status={status === 'live' ? 'ongoing' : status} />
      </div>
      <ActivityTools activity={activity} now={now} readOnly={readOnly} />
    </article>
  )
}

export function ActivityActions({ activity }: { activity: TeamActivity }) {
  return <ActivityTools activity={activity} />
}
