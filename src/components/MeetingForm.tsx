import { useOps } from '../store/OpsContext'
import { toDatetimeLocal } from '../utils/time'

function defaultStart(): Date {
  return new Date()
}

function defaultEnd(): Date {
  return new Date(Date.now() + 45 * 60 * 1000)
}

export function MeetingForm({
  onAdded,
  onCancel,
}: {
  onAdded?: () => void
  onCancel?: () => void
}) {
  const { state, addMeeting } = useOps()
  const lead = state.members.find((m) => m.role === 'Team Lead')?.id ?? state.members[0]?.id ?? ''

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
        addMeeting({
          title: String(data.get('title')).trim(),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          participantIds: selected.length ? selected : lead ? [lead] : [],
          agenda: String(data.get('agenda') || '').trim(),
          notes: String(data.get('notes') || '').trim(),
        })
        form.reset()
        onAdded?.()
      }}
    >
      <label>
        Meeting title
        <input name="title" required placeholder="Standup, huddle, review…" />
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
        <legend>Participants</legend>
        {state.members.map((member) => (
          <label key={member.id} className="check-line">
            <input type="checkbox" name="participants" value={member.id} defaultChecked />
            {member.name}
          </label>
        ))}
      </fieldset>
      <label>
        Agenda
        <textarea
          name="agenda"
          rows={4}
          placeholder="One item per line — overnight extract, late PHUs, blockers…"
        />
      </label>
      <label>
        Minutes
        <textarea name="notes" rows={3} placeholder="Leave blank until after the huddle" />
      </label>
      <div className="meeting-composer-actions">
        <button type="submit" className="primary-btn sm">
          Add meeting
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
