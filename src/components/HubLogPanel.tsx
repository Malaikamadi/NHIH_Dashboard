import { useMemo, useRef, useState } from 'react'
import { DISTRICTS, LOG_KINDS, districtLabel, logKindLabel } from '../data/catalog'
import { useOps } from '../store/OpsContext'
import type { DistrictId, HubLogEntry, HubLogKind } from '../types'
import { memberName, todaysHubLog } from '../utils/metrics'
import { formatDate, formatTime } from '../utils/time'
import { DeskDeleteButton } from './DeskDeleteButton'
import { Icon } from './Icons'

export function HubLogPanel({ now, allowInput = false }: { now: Date; allowInput?: boolean }) {
  const { state, addHubLog } = useOps()
  const [typeFilter, setTypeFilter] = useState<HubLogKind | 'all'>('all')
  const authorId =
    state.members.find((m) => m.role === 'Operations Manager')?.id ??
    state.members.find((m) => m.role === 'Team Lead')?.id ??
    state.members[0]?.id ??
    ''
  const entries = useMemo(() => {
    const list = allowInput
      ? [...(state.hubLog ?? [])].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 40)
      : todaysHubLog(state.hubLog, now)
    return typeFilter === 'all' ? list : list.filter((entry) => entry.kind === typeFilter)
  }, [allowInput, state.hubLog, now, typeFilter])

  const groups = LOG_KINDS.map((kind) => ({
    id: kind.id,
    label: kind.label,
    items: entries.filter((entry) => entry.kind === kind.id),
  })).filter((group) => group.items.length > 0)

  return (
    <section className="paper activity-card" id="hub-log">
      <header className="paper-h">
        <div>
          <h2>Hub incident log</h2>
          <p>Grouped by incident type — extracts, late reporting, and incidents</p>
        </div>
      </header>

      {allowInput && (
        <form
          className="hub-log-form"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const form = e.currentTarget
            const data = new FormData(form)
            const title = String(data.get('title')).trim()
            if (!title || !authorId) return
            const facility = String(data.get('facility') || '').trim()
            addHubLog({
              kind: String(data.get('kind')) as HubLogKind,
              title,
              detail: String(data.get('detail') || '').trim(),
              district: String(data.get('district')) as DistrictId,
              facility: facility || undefined,
              authorId,
            })
            form.reset()
          }}
        >
          <HubLogFields />
          <button type="submit" className="primary-btn sm">
            Log event
          </button>
        </form>
      )}

      <div className="log-type-tabs" role="tablist" aria-label="Incident type">
        <button
          type="button"
          className={typeFilter === 'all' ? 'is-on' : ''}
          onClick={() => setTypeFilter('all')}
        >
          All types
        </button>
        {LOG_KINDS.map((kind) => (
          <button
            key={kind.id}
            type="button"
            className={typeFilter === kind.id ? 'is-on' : ''}
            onClick={() => setTypeFilter(kind.id)}
          >
            {kind.label}
          </button>
        ))}
      </div>

      {entries.length === 0 && (
        <ul className="activity hub-log">
          <li>
            <span className="activity-time">Today</span>
            <span className="activity-dot">
              <Icon name="clipboard" size={14} />
            </span>
            <div>
              <strong>No {typeFilter === 'all' ? 'pipe events' : logKindLabel(typeFilter).toLowerCase()} yet</strong>
              <p>
                {allowInput
                  ? 'Choose an incident type, then log what happened.'
                  : 'Nothing logged for this type yet today.'}
              </p>
            </div>
          </li>
        </ul>
      )}

      {groups.map((group) => (
        <div key={group.id} className="hub-log-group">
          <h3>{group.label}</h3>
          <ul className="activity hub-log">
            {group.items.map((entry) => (
              <li key={entry.id} className={`tone-${logTone(entry.kind)}`}>
                <span className="activity-time">
                  {formatTime(entry.at)}
                  {allowInput ? ` · ${formatDate(entry.at)}` : ''}
                </span>
                <span className="activity-dot">
                  <Icon
                    name={
                      entry.kind === 'extract_restored'
                        ? 'check'
                        : entry.kind === 'extract_failed' || entry.kind === 'incident'
                          ? 'alert'
                          : 'clipboard'
                    }
                    size={14}
                  />
                </span>
                <div>
                  {allowInput ? (
                    <HubLogEditForm entry={entry} />
                  ) : (
                    <>
                      <strong>{entry.title}</strong>
                      <p>
                        {districtLabel(entry.district)}
                        {entry.facility ? ` · ${entry.facility}` : ''}
                        {entry.detail ? ` · ${entry.detail}` : ''}
                        {` · ${memberName(state.members, entry.authorId)}`}
                      </p>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function HubLogFields({ entry }: { entry?: HubLogEntry }) {
  return (
    <>
      <div className="admin-split">
        <label>
          Incident type
          <select name="kind" defaultValue={entry?.kind ?? 'incident'} required>
            {LOG_KINDS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          District
          <select name="district" defaultValue={entry?.district ?? 'western_urban'}>
            {DISTRICTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        What happened
        <input
          name="title"
          required
          defaultValue={entry?.title}
          placeholder="Late PHUs, extract failed, restored…"
        />
      </label>
      <label>
        Facility
        <input name="facility" defaultValue={entry?.facility ?? ''} placeholder="PHU / hospital (optional)" />
      </label>
      <label>
        Detail
        <textarea
          name="detail"
          rows={2}
          defaultValue={entry?.detail}
          placeholder="Optional note for the briefing and weekly report"
        />
      </label>
    </>
  )
}

function HubLogEditForm({ entry }: { entry: HubLogEntry }) {
  const { updateHubLog, removeHubLog } = useOps()
  const [saved, setSaved] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  return (
    <form
      id={`edit-log-${entry.id}`}
      ref={formRef}
      className="hub-log-form is-edit"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const data = new FormData(e.currentTarget)
        const title = String(data.get('title')).trim()
        if (!title) return
        const facility = String(data.get('facility') || '').trim()
        updateHubLog(entry.id, {
          kind: String(data.get('kind')) as HubLogKind,
          title,
          detail: String(data.get('detail') || '').trim(),
          district: String(data.get('district')) as DistrictId,
          facility: facility || '',
        })
        setSaved(true)
        window.setTimeout(() => setSaved(false), 2000)
      }}
    >
      <HubLogFields entry={entry} />
      <div className="meeting-composer-actions">
        <button type="button" className="primary-btn sm" onClick={() => formRef.current?.requestSubmit()}>
          Save updates
        </button>
        <DeskDeleteButton label={entry.title} onDelete={() => removeHubLog(entry.id)} />
        {saved && <p className="meet-saved">Log saved.</p>}
      </div>
    </form>
  )
}

function logTone(kind: HubLogKind): 'info' | 'success' | 'warn' | 'danger' {
  if (kind === 'extract_failed' || kind === 'incident') return 'danger'
  if (kind === 'late_reporting') return 'warn'
  if (kind === 'extract_restored') return 'success'
  return 'info'
}
