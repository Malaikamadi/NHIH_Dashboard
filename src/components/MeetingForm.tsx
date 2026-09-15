import { useOps } from '../store/OpsContext'
import type { Meeting } from '../types'
import { toDatetimeLocal } from '../utils/time'
import { ParticipantPicker } from './ParticipantPicker'

function defaultStart(): Date {
  return new Date()
}

function defaultEnd(): Date {
  return new Date(Date.now() + 45 * 60 * 1000)
}

export function MeetingForm({
  meeting,
  onAdded,
  onCancel,
}: {
  meeting?: Meeting
  onAdded?: () => void
  onCancel?: () => void
}) {
  const { state, addMeeting, updateMeeting } = useOps()
  const lead = state.members.find((m) => m.role === 'Team Lead')?.id ?? state.members[0]?.id ?? ''
  const editing = Boolean(meeting)

  return (
    <form
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
        const payload = {
          title: String(data.get('title')).trim(),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          participantIds: selected.length ? selected : lead ? [lead] : [],
          agenda: String(data.get('agenda') || '').trim(),
          notes: String(data.get('notes') || '').trim(),
        }
        if (meeting) {
          updateMeeting(meeting.id, payload)
        } else {
          addMeeting(payload)
          form.reset()
        }
        onAdded?.()
      }}
    >
      <label>
        Meeting title
        <input name="title" required defaultValue={meeting?.title} placeholder="Standup, huddle, review…" />
      </label>
      <div className="admin-split">
        <label>
          Start
          <input
            name="start"
            type="datetime-local"
            required
            defaultValue={toDatetimeLocal(meeting ? new Date(meeting.startTime) : defaultStart())}
          />
        </label>
        <label>
          End
          <input
            name="end"
            type="datetime-local"
            required
            defaultValue={toDatetimeLocal(meeting ? new Date(meeting.endTime) : defaultEnd())}
          />
        </label>
      </div>
      <ParticipantPicker
        members={state.members}
        selectedIds={meeting?.participantIds}
        defaultAll={!meeting}
        legend="Participants"
      />
      <label>
        Agenda
        <textarea
          name="agenda"
          rows={4}
          defaultValue={meeting?.agenda}
          placeholder="One item per line — overnight extract, late PHUs, blockers…"
        />
      </label>
      <label>
        Minutes
        <textarea
          name="notes"
          rows={3}
          defaultValue={meeting?.notes}
          placeholder="Leave blank until after the huddle"
        />
      </label>
      <div className="meeting-composer-actions">
        <button type="submit" className="primary-btn sm">
          {editing ? 'Save meeting' : 'Add meeting'}
        </button>
        {onCancel && (
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
