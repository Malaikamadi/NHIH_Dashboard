import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  checkInVisitor,
  checkOutVisitor,
  fetchVisitorRegister,
  registerWalkInVisitor,
  syncVisitorsFromSheets,
} from '../api'
import type { VisitorRegisterResponse, VisitorStatus, VisitorSyncResult } from '../types'
import { formatFreetownDateTime, formatFreetownTime } from '../utils/time'

export function VisitorDesk({ onSaved }: { onSaved?: (message: string) => void }) {
  const [data, setData] = useState<VisitorRegisterResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<VisitorSyncResult | null>(null)
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({})

  const [fullName, setFullName] = useState('')
  const [organization, setOrganization] = useState('')
  const [purpose, setPurpose] = useState('')
  const [checkInNow, setCheckInNow] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [historyQuery, setHistoryQuery] = useState('')
  const [historyFilter, setHistoryFilter] = useState<'all' | VisitorStatus | 'historical'>('all')
  const [historyDate, setHistoryDate] = useState('')
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10))

  const load = useCallback(async () => {
    setError('')
    try {
      const next = await fetchVisitorRegister()
      setData(next)
      if (next.lastSync) {
        setSyncResult(next.lastSync)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load visitor register')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      setToday(new Date().toISOString().slice(0, 10))
      void load()
    }, 60000)
    return () => window.clearInterval(timer)
  }, [load])

  const activeVisitors = useMemo(
    () => (data?.visits ?? []).filter((v) => v.status === 'checked_in'),
    [data],
  )

  const awaitingCheckIn = useMemo(
    () => (data?.visits ?? []).filter((v) => v.status === 'registered' && v.registeredAt.slice(0, 10) === today),
    [data, today],
  )

  const historical = (data?.visits ?? []).filter(v => v.status === 'registered' && v.registeredAt.slice(0, 10) < today)
  const weekStart = new Date(today + 'T00:00:00Z')
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7)
  const week = weekStart.toISOString().slice(0, 10)
  const visits = data?.visits ?? []
  const daily = visits.filter(v => v.registeredAt.slice(0, 10) === today).length
  const weekly = visits.filter(v => v.registeredAt.slice(0, 10) >= week && v.registeredAt.slice(0, 10) <= today).length
  const monthly = visits.filter(v => v.registeredAt.slice(0, 7) === today.slice(0, 7) && v.registeredAt.slice(0, 10) <= today).length
  const breakdown = (field: 'organization' | 'purpose') => {
    const counts = new Map<string, number>()
    for (const visit of visits) {
      const raw = visit[field].trim().replace(/\s+/g, ' ') || 'Not specified'
      const label = field === 'organization' && /^(moh|ministry of health)$/i.test(raw) ? 'Ministry of Health (MoH)' : raw
      const existing = [...counts.keys()].find(key => key.toLowerCase() === label.toLowerCase()) ?? label
      counts.set(existing, (counts.get(existing) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }

  const trend = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(today + 'T00:00:00Z')
    date.setUTCDate(date.getUTCDate() - 13 + i)
    const day = date.toISOString().slice(0, 10)
    return { day, count: visits.filter(v => v.registeredAt.slice(0, 10) === day).length }
  })
  const peak = Math.max(1, ...trend.map(d => d.count))

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase()
    return (data?.visits ?? []).filter((visit) => {
      const status = visit.status === 'registered' && visit.registeredAt.slice(0, 10) < today ? 'historical' : visit.status
      if (historyFilter !== 'all' && status !== historyFilter) return false
      if (historyDate && visit.registeredAt.slice(0, 10) !== historyDate) return false
      if (!q) return true
      return (
        visit.fullName.toLowerCase().includes(q) ||
        visit.organization.toLowerCase().includes(q) ||
        visit.purpose.toLowerCase().includes(q)
      )
    })
  }, [data, historyQuery, historyFilter, historyDate, today])

  const handleSync = async () => {
    setSyncing(true)
    setError('')
    onSaved?.('')
    try {
      const result = await syncVisitorsFromSheets()
      setSyncResult(result)
      await load()
      onSaved?.(
        `Google Sheets sync complete: ${result.imported} imported, ${result.unchanged} unchanged, ${result.skippedCount} skipped.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sheets sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleWalkIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim() || !purpose.trim()) return
    setSubmitting(true)
    setError('')
    onSaved?.('')
    try {
      const res = await registerWalkInVisitor({
        fullName: fullName.trim(),
        organization: organization.trim(),
        purpose: purpose.trim(),
        checkInNow,
      })
      setFullName('')
      setOrganization('')
      setPurpose('')
      setCheckInNow(true)
      await load()
      onSaved?.(
        res.visit.status === 'checked_in'
          ? `${res.visit.fullName} registered and checked in.`
          : `${res.visit.fullName} registered (awaiting check-in).`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save walk-in visitor')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckIn = async (id: string, name: string) => {
    if (busyIds[id]) return
    setBusyIds((prev) => ({ ...prev, [id]: true }))
    setError('')
    onSaved?.('')
    try {
      const res = await checkInVisitor(id)
      await load()
      onSaved?.(
        res.alreadyCheckedIn
          ? `${name} was already checked in.`
          : `${name} checked in.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check in visitor')
    } finally {
      setBusyIds((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const handleCheckOut = async (id: string, name: string) => {
    if (busyIds[id]) return
    setBusyIds((prev) => ({ ...prev, [id]: true }))
    setError('')
    onSaved?.('')
    try {
      const res = await checkOutVisitor(id)
      await load()
      onSaved?.(
        res.alreadyCheckedOut
          ? `${name} was already checked out.`
          : `${name} checked out.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check out visitor')
    } finally {
      setBusyIds((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const latestSync = syncResult ?? data?.lastSync ?? null

  return (
    <div className="visitor-desk visitor-intelligence-light">
      <style>{`.visitor-intelligence-light {color:#19334c;background:#f4f7fa;padding:clamp(12px,2vw,24px);border-radius:12px;min-width:0}
.visitor-intelligence-light h3,.visitor-intelligence-light h4,.visitor-intelligence-light strong {color:#173b57}
.visitor-intelligence-light .muted,.visitor-intelligence-light .admin-help,.visitor-intelligence-light .visitor-org,.visitor-intelligence-light .visitor-purpose {color:#526579}
.visitor-intelligence-light .visitor-kpi,.visitor-intelligence-light .visitor-panel,.visitor-intelligence-light .visitor-sync-card,.visitor-intelligence-light .visitor-card {background:#fff;color:#19334c;border:1px solid #d9e4ec;box-shadow:0 2px 8px #173b5708}
.visitor-intelligence-light .visitor-kpi span {color:#526579}
.visitor-intelligence-light .visitor-kpi.is-active {border-left:4px solid #19845d}
.visitor-intelligence-light .visitor-kpi strong {font-size:clamp(24px,3vw,34px)}
.visitor-intelligence-light .visitor-kpis {grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.visitor-intelligence-light .visitor-grid {grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.visitor-intelligence-light input,.visitor-intelligence-light select {background:#fff;color:#19334c;border:1px solid #b9cbd9}
.visitor-intelligence-light .ghost-btn {background:#fff;color:#174b70;border:1px solid #b9cbd9}
.visitor-intelligence-light .primary-btn {background:#175b83;color:white}
.visitor-intelligence-light .visitor-history-table {color:#19334c;background:white}
.visitor-intelligence-light .visitor-history-table th {background:#eaf1f6;color:#173b57}
.visitor-intelligence-light .visitor-history-table td {background:#fff;color:#19334c;border-color:#d9e4ec}
.visitor-intelligence-light .visitor-status,.visitor-intelligence-light .visitor-badge {background:#eaf1f6;color:#174b70}
.visitor-intelligence-light progress {accent-color:#24769b;height:10px}
.visitor-intelligence-light .visitor-trend {display:grid;grid-template-columns:repeat(14,minmax(0,1fr));gap:4px;align-items:end}
@media(max-width:760px){.visitor-intelligence-light .visitor-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.visitor-intelligence-light .visitor-grid{grid-template-columns:minmax(0,1fr)}.visitor-intelligence-light .visitor-trend{gap:2px}}
`}</style>
      <div className="visitor-desk-head">
        <div>
          <h3>Visitor Intelligence</h3>
          <p className="admin-help">
            Operator-only attendance log. All times are shown in Africa/Freetown. Only the checked-in count appears on the shared Overview.
          </p>
        </div>
        <div className="visitor-desk-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => void handleSync()}
            disabled={syncing}
          >
            {syncing ? 'Syncing…' : 'Sync Google Sheets'}
          </button>
        </div>
      </div>

      {error && (
        <p className="warn-text" role="alert">
          {error}
        </p>
      )}

      <div className="visitor-kpis">
        <div className="visitor-kpi is-active">
          <span>Currently checked in</span>
          <strong>{data?.checkedInCount ?? 0}</strong>
        </div>
        <div className="visitor-kpi">
          <span>Awaiting check-in today</span>
          <strong>{awaitingCheckIn.length}</strong>
        </div>
        <div className="visitor-kpi">
          <span>Checked out</span>
          <strong>{data?.checkedOutCount ?? 0}</strong>
        </div>
        <div className="visitor-kpi">
          <span>Total registrations</span>
          <strong>{data?.visits.length ?? 0}</strong>
        </div>
      </div>

      <div className="visitor-kpis">
        <div className="visitor-kpi"><span>Historical registrations</span><strong>{historical.length}</strong></div>
        <div className="visitor-kpi"><span>Today</span><strong>{daily}</strong></div>
        <div className="visitor-kpi"><span>This week</span><strong>{weekly}</strong></div>
        <div className="visitor-kpi"><span>This month</span><strong>{monthly}</strong></div>
      </div>
      <p className="admin-help">Historical registrations have no confirmed attendance. Registration counts are not confirmed visits. Week begins Monday; dates use Freetown time.</p>
      <section className="visitor-panel" style={{marginBottom:16}}>
        <h4>Registration activity · Last 14 days</h4>
        <div className="visitor-trend" role="group" aria-label="Daily registrations over the last 14 days">
          {trend.map(d => <div key={d.day} title={d.day + ': ' + d.count} style={{textAlign:'center',minWidth:0}}>
            <small>{d.count}</small>
            <div style={{height:100,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
              <div style={{width:'72%',height:(d.count / peak * 100) + '%',background:'#24769b',borderRadius:'4px 4px 0 0'}} />
            </div>
            <small>{d.day.slice(8)}</small>
          </div>)}
        </div>
        <p className="muted">{trend[0].day} — {today} · Freetown time</p>
      </section>
      <div className="visitor-grid">
        {(['organization', 'purpose'] as const).map(field => (
          <section className="visitor-panel" key={field}>
            <h4>{field === 'organization' ? 'Top organisations' : 'Top purposes'} — all registrations</h4>
            {breakdown(field).map(([label, count]) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div>{label} · {count}</div>
                <progress value={count} max={Math.max(1, visits.length)} style={{ width: '100%' }} />
              </div>
            ))}
          </section>
        ))}
      </div>

      {data && !data.sheetsConfigured && (
        <p className="visitor-note">
          Google Sheets sync is not configured yet on this server. Set <code>GOOGLE_SHEETS_SPREADSHEET_ID</code> and read-only service account credentials in the server environment to enable sheet imports.
        </p>
      )}

      {latestSync && (
        <section className="visitor-sync-card">
          <div className="visitor-sync-summary">
            <strong>Last Google Sheets sync</strong>
            <span className="muted">
              {formatFreetownDateTime(latestSync.syncedAt)} (Africa/Freetown) · Tab: {latestSync.tabName}
            </span>
          </div>
          <div className="visitor-sync-counts">
            <span>Imported: <b>{latestSync.imported}</b></span>
            <span>Unchanged: <b>{latestSync.unchanged}</b></span>
            <span>Skipped: <b>{latestSync.skippedCount}</b></span>
          </div>
          <div className="visitor-mapping">
            <small>
              Verified mapping — Timestamp: <b>{latestSync.columnMapping.timestamp}</b> · Name:{' '}
              <b>{latestSync.columnMapping.fullName}</b> · Org/Unit:{' '}
              <b>{latestSync.columnMapping.organization}</b> · Purpose:{' '}
              <b>{latestSync.columnMapping.purpose}</b>
              {latestSync.columnMapping.ignoredColumns.length > 0 && (
                <> · Left in sheet: {latestSync.columnMapping.ignoredColumns.join(', ')}</>
              )}
            </small>
          </div>
          {latestSync.skipped.length > 0 && (
            <details className="visitor-skipped">
              <summary>Skipped rows ({latestSync.skipped.length})</summary>
              <ul>
                {latestSync.skipped.map((row) => (
                  <li key={`${row.rowNumber}-${row.reason}`}>
                    Row {row.rowNumber}: {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <div className="visitor-grid">
        <section className="visitor-panel">
          <h4>Register walk-in visitor</h4>
          <form className="admin-form" onSubmit={(e) => void handleWalkIn(e)}>
            <label>
              Full name
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Aminata Kamara"
                required
              />
            </label>
            <label>
              Organization or unit
              <input
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g. Ministry of Health — DHIS2 Unit"
              />
            </label>
            <label>
              Purpose of visit (operator-only)
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. EMR integration review"
                required
              />
            </label>
            <label className="visitor-checkbox">
              <input
                type="checkbox"
                checked={checkInNow}
                onChange={(e) => setCheckInNow(e.target.checked)}
              />
              <span>Check in immediately</span>
            </label>
            <button type="submit" className="primary-btn" disabled={submitting}>
              {submitting
                ? 'Saving…'
                : checkInNow
                  ? 'Register & check in'
                  : 'Register walk-in'}
            </button>
          </form>
        </section>

        <section className="visitor-panel">
          <div className="visitor-panel-head">
            <h4>Currently at the Hub ({activeVisitors.length})</h4>
            <span className="muted">Check-in times in Africa/Freetown</span>
          </div>
          {loading ? (
            <p className="muted">Loading active visitors…</p>
          ) : activeVisitors.length === 0 ? (
            <p className="muted">No visitors are currently checked in.</p>
          ) : (
            <div className="visitor-list">
              {activeVisitors.map((visit) => (
                <div key={visit.id} className="visitor-card">
                  <div className="visitor-card-main">
                    <strong>{visit.fullName}</strong>
                    <span className="visitor-org">{visit.organization || 'No organization listed'}</span>
                    <small className="visitor-purpose">Purpose: {visit.purpose || '—'}</small>
                    <small className="muted">
                      Checked in: {visit.checkedInAt ? formatFreetownDateTime(visit.checkedInAt) : '—'}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={Boolean(busyIds[visit.id])}
                    onClick={() => void handleCheckOut(visit.id, visit.fullName)}
                  >
                    {busyIds[visit.id] ? 'Checking out…' : 'Check out'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="visitor-panel">
        <div className="visitor-panel-head">
          <h4>Awaiting check-in ({awaitingCheckIn.length})</h4>
          <span className="muted">Imported Google Form registrations and pre-registered visits</span>
        </div>
        {awaitingCheckIn.length === 0 ? (
          <p className="muted">No registered visitors waiting to check in.</p>
        ) : (
          <div className="visitor-list">
            {awaitingCheckIn.map((visit) => (
              <div key={visit.id} className="visitor-card">
                <div className="visitor-card-main">
                  <div className="visitor-card-title">
                    <strong>{visit.fullName}</strong>
                    <span className="visitor-badge">
                      {visit.source === 'google_sheets' ? 'Google Form' : 'Walk-in'}
                    </span>
                  </div>
                  <span className="visitor-org">{visit.organization || 'No organization listed'}</span>
                  <small className="visitor-purpose">Purpose: {visit.purpose || '—'}</small>
                  <small className="muted">
                    Registered: {formatFreetownDateTime(visit.registeredAt)}
                  </small>
                </div>
                <button
                  type="button"
                  className="primary-btn sm"
                  disabled={Boolean(busyIds[visit.id])}
                  onClick={() => void handleCheckIn(visit.id, visit.fullName)}
                >
                  {busyIds[visit.id] ? 'Checking in…' : 'Check in'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="visitor-panel">
        <div className="visitor-panel-head">
          <h4>Visit history ({filteredHistory.length})</h4>
          <div className="visitor-history-tools">
            <input
              type="search"
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              placeholder="Search name, org, purpose…"
              aria-label="Search visit history"
            />
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value as 'all' | VisitorStatus | 'historical')}
              aria-label="Filter visit status"
            >
              <option value="all">All statuses</option>
              <option value="checked_in">Checked in</option>
              <option value="registered">Awaiting / future</option>
              <option value="historical">Historical registration</option>
              <option value="checked_out">Checked out</option>
            </select>
            <input type="date" value={historyDate} onChange={e => setHistoryDate(e.target.value)} aria-label="Filter registration date" />
            <button type="button" className="ghost-btn" onClick={() => { setHistoryDate(''); setHistoryQuery(''); setHistoryFilter('all') }}>Clear filters</button>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <p className="muted">No visit records match the current filter.</p>
        ) : (
          <div className="visitor-history-wrap">
            <table className="visitor-history-table">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Organization / Unit</th>
                  <th>Purpose</th>
                  <th>Status</th>
                  <th>Registered (Freetown)</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((visit) => (
                  <tr key={visit.id}>
                    <td>
                      <strong>{visit.fullName}</strong>
                      <div className="muted visitor-source-sub">
                        {visit.source === 'google_sheets' ? 'Google Form' : 'Walk-in'}
                      </div>
                    </td>
                    <td>{visit.organization || '—'}</td>
                    <td>{visit.purpose || '—'}</td>
                    <td>
                      <span className={`visitor-status is-${visit.status}`}>
                        {visit.status === 'checked_in'
                          ? 'Checked in'
                          : visit.status === 'registered'
                            ? (visit.registeredAt.slice(0, 10) < today ? 'Historical — unconfirmed' : 'Registered')
                            : 'Checked out'}
                      </span>
                    </td>
                    <td>{formatFreetownDateTime(visit.registeredAt)}</td>
                    <td>
                      {visit.checkedInAt
                        ? `${formatFreetownDateTime(visit.checkedInAt)}`
                        : '—'}
                    </td>
                    <td>
                      {visit.checkedOutAt
                        ? `${formatFreetownTime(visit.checkedOutAt)} (${formatFreetownDateTime(visit.checkedOutAt)})`
                        : '—'}
                    </td>
                    <td>
                      {visit.status === 'registered' && visit.registeredAt.slice(0, 10) === today && (
                        <button
                          type="button"
                          className="primary-btn sm"
                          disabled={Boolean(busyIds[visit.id])}
                          onClick={() => void handleCheckIn(visit.id, visit.fullName)}
                        >
                          Check in
                        </button>
                      )}
                      {visit.status === 'checked_in' && (
                        <button
                          type="button"
                          className="ghost-btn"
                          disabled={Boolean(busyIds[visit.id])}
                          onClick={() => void handleCheckOut(visit.id, visit.fullName)}
                        >
                          Check out
                        </button>
                      )}
                      {visit.status === 'checked_out' && <span className="muted">Completed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
