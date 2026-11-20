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
  const [historyFilter, setHistoryFilter] = useState<'all' | VisitorStatus>('all')

  const load = useCallback(async () => {
    setError('')
    try {
      const next = await fetchVisitorRegister()
      setData(next)
      if (next.lastSync) {
        setSyncResult((prev) => prev ?? next.lastSync)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load visitor register')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const activeVisitors = useMemo(
    () => (data?.visits ?? []).filter((v) => v.status === 'checked_in'),
    [data],
  )

  const awaitingCheckIn = useMemo(
    () => (data?.visits ?? []).filter((v) => v.status === 'registered'),
    [data],
  )

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase()
    return (data?.visits ?? []).filter((visit) => {
      if (historyFilter !== 'all' && visit.status !== historyFilter) return false
      if (!q) return true
      return (
        visit.fullName.toLowerCase().includes(q) ||
        visit.organization.toLowerCase().includes(q) ||
        visit.purpose.toLowerCase().includes(q)
      )
    })
  }, [data, historyQuery, historyFilter])

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
    <div className="visitor-desk">
      <div className="visitor-desk-head">
        <div>
          <h3>Visitor Register</h3>
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
          <span>Awaiting check-in</span>
          <strong>{data?.registeredCount ?? 0}</strong>
        </div>
        <div className="visitor-kpi">
          <span>Checked out</span>
          <strong>{data?.checkedOutCount ?? 0}</strong>
        </div>
        <div className="visitor-kpi">
          <span>Total visits</span>
          <strong>{data?.visits.length ?? 0}</strong>
        </div>
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
              onChange={(e) => setHistoryFilter(e.target.value as 'all' | VisitorStatus)}
              aria-label="Filter visit status"
            >
              <option value="all">All statuses</option>
              <option value="checked_in">Checked in</option>
              <option value="registered">Registered</option>
              <option value="checked_out">Checked out</option>
            </select>
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
                            ? 'Registered'
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
                      {visit.status === 'registered' && (
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
