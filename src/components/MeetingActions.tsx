import { useEffect, useState } from 'react'
import { PlaceFields, placeFromForm } from './PlaceFields'
import { useOps } from '../store/OpsContext'
import type { Meeting, MeetingStatus } from '../types'
import { agendaLines, meetingStatus } from '../utils/metrics'
import { addDays, formatDate, formatTimeRange, nowIso, toDatetimeLocal } from '../utils/time'
import { StatusPill } from './Header'

function defaultDeadline(): string {
  const date = addDays(new Date(), 1)
  date.setHours(17, 0, 0, 0)
  return toDatetimeLocal(date)
}

function AgendaList({ agenda }: { agenda?: string }) {
  const items = agendaLines(agenda)
  if (!items.length) return null
  return (
    <div className="meet-agenda">
      <span className="meet-agenda-label">Agenda</span>
      <ol>
        {items.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ol>
    </div>
  )
}

function MeetingTools({
  meeting,
  now,
  readOnly,
}: {
  meeting: Meeting
  now?: Date
  readOnly?: boolean
}) {
  const { state, updateMeeting, addActionItem } = useOps()
  const status: MeetingStatus = meetingStatus(meeting, now)
  const [panel, setPanel] = useState<'action' | 'agenda' | 'minutes' | null>(null)
  const [notes, setNotes] = useState(meeting.notes ?? '')
  const [agenda, setAgenda] = useState(meeting.agenda ?? '')
  const [saved, setSaved] = useState<'agenda' | 'minutes' | null>(null)
  const openActions = state.actionItems.filter(
    (item) => item.meetingId === meeting.id && item.status !== 'completed',
  ).length

  useEffect(() => {
    setNotes(meeting.notes ?? '')
  }, [meeting.notes])

  useEffect(() => {
    setAgenda(meeting.agenda ?? '')
  }, [meeting.agenda])

  const toggle = (next: 'action' | 'agenda' | 'minutes') => {
    setSaved(null)
    setPanel((current) => (current === next ? null : next))
  }

  const startMeeting = () => {
    const start = new Date()
    const currentEnd = new Date(meeting.endTime)
    const minEnd = new Date(start.getTime() + 30 * 60 * 1000)
    updateMeeting(meeting.id, {
      startTime: start.toISOString(),
      endTime: currentEnd > minEnd ? currentEnd.toISOString() : minEnd.toISOString(),
      rolling: false,
    })
  }

  const endMeeting = () => {
    updateMeeting(meeting.id, { endTime: nowIso(), rolling: false })
  }

  const leadId = state.members.find((m) => m.role === 'Team Lead')?.id
  const defaultOwner = meeting.participantIds[0] ?? leadId ?? state.members[0]?.id ?? ''
  const hasMinutes = Boolean((meeting.notes ?? '').trim())
  const hasAgenda = agendaLines(meeting.agenda).length > 0

  if (readOnly) {
    return (
      <div className="meeting-actions">
        {hasAgenda && <AgendaList agenda={meeting.agenda} />}
        {hasMinutes && <p className="meet-minutes">{meeting.notes}</p>}
      </div>
    )
  }

  return (
    <div className="meeting-actions">
      <div className="meeting-actions-bar">
        {status === 'upcoming' && (
          <button type="button" className="complete-btn" onClick={startMeeting}>
            Start
          </button>
        )}
        {status === 'live' && (
          <button type="button" className="complete-btn" onClick={endMeeting}>
            End
          </button>
        )}
        {status === 'completed' && <span className="muted">Ended</span>}
        <button
          type="button"
          className={`tool-btn ${panel === 'agenda' ? 'is-on' : ''}`}
          onClick={() => toggle('agenda')}
        >
          {hasAgenda ? 'Edit agenda' : 'Add agenda'}
        </button>
        <button
          type="button"
          className={`tool-btn ${panel === 'action' ? 'is-on' : ''}`}
          onClick={() => toggle('action')}
        >
          Action{openActions ? ` (${openActions})` : ''}
        </button>
        <button
          type="button"
          className={`tool-btn ${panel === 'minutes' ? 'is-on' : ''}`}
          onClick={() => toggle('minutes')}
        >
          {hasMinutes ? 'Edit minutes' : 'Add minutes'}
        </button>
      </div>

      {hasAgenda && panel !== 'agenda' && <AgendaList agenda={meeting.agenda} />}
      {saved === 'agenda' && panel !== 'agenda' && <p className="meet-saved">Agenda saved</p>}
      {hasMinutes && panel !== 'minutes' && <p className="meet-minutes">{meeting.notes}</p>}
      {saved === 'minutes' && panel !== 'minutes' && <p className="meet-saved">Minutes saved</p>}

      {panel === 'agenda' && (
        <form
          className="meeting-tool-form"
          onSubmit={(e) => {
            e.preventDefault()
            const next = agenda.trim()
            updateMeeting(meeting.id, { agenda: next })
            setAgenda(next)
            setSaved('agenda')
            setPanel(null)
          }}
        >
          <textarea
            rows={5}
            value={agenda}
            onChange={(e) => {
              setSaved(null)
              setAgenda(e.target.value)
            }}
            placeholder="One item per line — overnight extract, late PHUs, blockers…"
            aria-label={`Agenda for ${meeting.title}`}
          />
          <button type="submit" className="complete-btn">
            Save agenda
          </button>
        </form>
      )}

      {panel === 'action' && (
        <form
          className="meeting-tool-form"
          onSubmit={(e) => {
            e.preventDefault()
            const form = e.currentTarget
            const data = new FormData(form)
            addActionItem({
              meetingId: meeting.id,
              meetingTitle: meeting.title,
              title: String(data.get('title')),
              assignedTo: String(data.get('assignedTo')),
              deadline: new Date(String(data.get('deadline'))).toISOString(),
              status: 'open',
              ...placeFromForm(data),
            })
            form.reset()
            setPanel(null)
          }}
        >
          <input name="title" required placeholder="Action point" aria-label="Action point" />
          <div className="meeting-tool-split">
            <select name="assignedTo" defaultValue={defaultOwner} aria-label="Owner">
              {state.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name.split(' ')[0]}
                </option>
              ))}
            </select>
            <input
              name="deadline"
              type="datetime-local"
              required
              defaultValue={defaultDeadline()}
              aria-label="Deadline"
            />
          </div>
          <PlaceFields />
          <button type="submit" className="complete-btn">
            Add action
          </button>
        </form>
      )}

      {panel === 'minutes' && (
        <form
          className="meeting-tool-form"
          onSubmit={(e) => {
            e.preventDefault()
            const next = notes.trim()
            updateMeeting(meeting.id, { notes: next })
            setNotes(next)
            setSaved('minutes')
            setPanel(null)
          }}
        >
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => {
              setSaved(null)
              setNotes(e.target.value)
            }}
            placeholder="Decisions, discussion, and follow-up"
            aria-label={`Minutes for ${meeting.title}`}
          />
          <button type="submit" className="complete-btn">
            Save minutes
          </button>
        </form>
      )}
    </div>
  )
}

export function MeetingSession({
  meeting,
  now,
  readOnly,
}: {
  meeting: Meeting
  now?: Date
  readOnly?: boolean
}) {
  const status = meetingStatus(meeting, now)
  return (
    <article className="meet-block">
      <div className="data-row meet-row">
        <strong>{meeting.title}</strong>
        <span>
          {formatDate(meeting.startTime)} · {formatTimeRange(meeting.startTime, meeting.endTime)}
        </span>
        <span>{meeting.participantIds.length} people</span>
        <StatusPill status={status === 'live' ? 'ongoing' : status} />
      </div>
      <MeetingTools meeting={meeting} now={now} readOnly={readOnly} />
    </article>
  )
}

export function MeetingActions({
  meeting,
  now,
}: {
  meeting: Meeting
  now?: Date
}) {
  return <MeetingTools meeting={meeting} now={now} />
}
