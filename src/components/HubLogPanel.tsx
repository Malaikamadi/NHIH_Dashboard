import { DISTRICTS, LOG_KINDS, districtLabel, logKindLabel } from '../data/catalog'
import { useOps } from '../store/OpsContext'
import type { DistrictId, HubLogKind } from '../types'
import { memberName, todaysHubLog } from '../utils/metrics'
import { formatTime } from '../utils/time'
import { Icon } from './Icons'

export function HubLogPanel({ now, allowInput = false }: { now: Date; allowInput?: boolean }) {
  const { state, addHubLog } = useOps()
  const today = todaysHubLog(state.hubLog, now)
  const authorId =
    state.members.find((m) => m.role === 'Operations Manager')?.id ??
    state.members.find((m) => m.role === 'Team Lead')?.id ??
    state.members[0]?.id ??
    ''

  return (
    <section className="paper activity-card">
      <header className="paper-h">
        <div>
          <h2>Hub log</h2>
          <p>Extracts, late reporting, and incidents — not meeting minutes</p>
        </div>
      </header>

      {allowInput && (
      <form
        className="hub-log-form"
        onSubmit={(e) => {
          e.preventDefault()
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
        <div className="admin-split">
          <label>
            Kind
            <select name="kind" defaultValue="late_reporting">
              {LOG_KINDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            District
            <select name="district" defaultValue="western_urban">
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
          <input name="title" required placeholder="Late PHUs, extract failed, restored…" />
        </label>
        <label>
          Facility
          <input name="facility" placeholder="PHU / hospital (optional)" />
        </label>
        <label>
          Detail
          <textarea name="detail" rows={2} placeholder="Optional note for the briefing and weekly report" />
        </label>
        <button type="submit" className="primary-btn sm">
          Log event
        </button>
      </form>
      )}

      <ul className="activity hub-log">
        {today.length === 0 && (
          <li>
            <span className="activity-time">Today</span>
            <span className="activity-dot">
              <Icon name="clipboard" size={14} />
            </span>
            <div>
              <strong>No pipe events yet</strong>
              <p>{allowInput ? 'Log a failed extract, late reporting, or incident as it happens.' : 'Nothing logged yet today.'}</p>
            </div>
          </li>
        )}
        {today.map((entry) => (
          <li key={entry.id} className={`tone-${logTone(entry.kind)}`}>
            <span className="activity-time">{formatTime(entry.at)}</span>
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
              <strong>
                {logKindLabel(entry.kind)} · {entry.title}
              </strong>
              <p>
                {districtLabel(entry.district)}
                {entry.facility ? ` · ${entry.facility}` : ''}
                {entry.detail ? ` · ${entry.detail}` : ''}
                {` · ${memberName(state.members, entry.authorId)}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function logTone(kind: HubLogKind): 'info' | 'success' | 'warn' | 'danger' {
  if (kind === 'extract_failed' || kind === 'incident') return 'danger'
  if (kind === 'late_reporting') return 'warn'
  if (kind === 'extract_restored') return 'success'
  return 'info'
}
