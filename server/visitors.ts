import type pg from 'pg'
import type {
  VisitorRegisterResponse,
  VisitorSummary,
  VisitorSyncResult,
  VisitorVisit,
} from '../src/types'
import { uid } from '../src/utils/time'
import { HttpError } from './errors'
import {
  fetchGoogleSheetValues,
  googleSheetsConfigured,
  parseSheetRows,
} from './google-sheets'
import { getPostgresPool, migratePostgres, postgresActive } from './postgres'

const LAST_SYNC_META_KEY = 'visitor_last_sync'

let schemaReady: Promise<void> | null = null

async function ensureVisitorStorage(): Promise<pg.Pool> {
  if (!postgresActive()) {
    throw new HttpError(
      503,
      'Visitor register requires PostgreSQL persistence (PERSISTENCE=postgres and DATABASE_URL)',
    )
  }
  if (!schemaReady) {
    schemaReady = migratePostgres().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  await schemaReady
  return getPostgresPool()
}

type VisitorVisitRow = {
  id: string
  source: 'google_sheets' | 'walk_in'
  source_key: string | null
  source_row_number: number | null
  full_name: string
  organization: string
  purpose: string
  registered_at: Date | string
  checked_in_at: Date | string | null
  checked_out_at: Date | string | null
  status: 'registered' | 'checked_in' | 'checked_out'
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

function mapVisit(row: VisitorVisitRow): VisitorVisit {
  return {
    id: row.id,
    source: row.source,
    sourceRowNumber: row.source_row_number ?? undefined,
    fullName: row.full_name,
    organization: row.organization,
    purpose: row.purpose,
    registeredAt: iso(row.registered_at),
    checkedInAt: row.checked_in_at ? iso(row.checked_in_at) : undefined,
    checkedOutAt: row.checked_out_at ? iso(row.checked_out_at) : undefined,
    status: row.status,
  }
}

async function queryCheckedInCount(client: pg.Pool | pg.PoolClient): Promise<number> {
  const res = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM visitor_visits
     WHERE status = 'checked_in'
       AND checked_in_at IS NOT NULL
       AND checked_out_at IS NULL`,
  )
  return Number(res.rows[0]?.count ?? 0)
}

async function readLastSync(client: pg.Pool | pg.PoolClient): Promise<VisitorSyncResult | null> {
  const res = await client.query<{ value: string }>(
    `SELECT value FROM meta WHERE key = $1`,
    [LAST_SYNC_META_KEY],
  )
  const raw = res.rows[0]?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as VisitorSyncResult
  } catch {
    return null
  }
}

export async function getVisitorSummary(): Promise<VisitorSummary> {
  const pool = await ensureVisitorStorage()
  const res = await pool.query<{ purpose: string }>(
    `SELECT purpose
     FROM visitor_visits
     WHERE status = 'checked_in'
       AND checked_in_at IS NOT NULL
       AND checked_out_at IS NULL
     ORDER BY checked_in_at DESC`,
  )
  const seen = new Set<string>()
  const activePurposes: string[] = []
  for (const row of res.rows) {
    const clean = row.purpose.trim()
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    activePurposes.push(clean)
  }
  const total = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM visitor_visits WHERE source = 'google_sheets'")
  return {
    totalVisits: Number(total.rows[0].count),
    checkedInCount: res.rows.length,
    activePurposes,
    updatedAt: new Date().toISOString(),
  }
}

export async function listVisitorRegister(): Promise<VisitorRegisterResponse> {
  const pool = await ensureVisitorStorage()
  const [visitsRes, lastSync] = await Promise.all([
    pool.query<VisitorVisitRow>(
      `SELECT id, source, source_key, source_row_number, full_name, organization, purpose,
              registered_at, checked_in_at, checked_out_at, status
       FROM visitor_visits
       ORDER BY
         CASE status
           WHEN 'checked_in' THEN 0
           WHEN 'registered' THEN 1
           ELSE 2
         END,
         COALESCE(checked_in_at, registered_at) DESC`,
    ),
    readLastSync(pool),
  ])

  const visits = visitsRes.rows.map(mapVisit)
  let checkedInCount = 0
  let registeredCount = 0
  let checkedOutCount = 0
  for (const visit of visits) {
    if (visit.status === 'checked_in') checkedInCount++
    else if (visit.status === 'registered') registeredCount++
    else checkedOutCount++
  }

  return {
    checkedInCount,
    registeredCount,
    checkedOutCount,
    visits,
    lastSync,
    sheetsConfigured: googleSheetsConfigured(),
  }
}

export async function syncVisitorSheetValues(
  values: string[][],
  options: { spreadsheetId: string; tabName: string },
): Promise<VisitorSyncResult> {
  const pool = await ensureVisitorStorage()
  const parsed = parseSheetRows(values, options)
  const syncedAt = new Date().toISOString()

  const client = await pool.connect()
  let imported = 0
  let unchanged = 0

  try {
    await client.query('BEGIN')

    for (const record of parsed.records) {
      const visitId = uid('vis')
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO visitor_visits (
           id, source, source_key, source_row_number, full_name, organization, purpose,
           registered_at, checked_in_at, checked_out_at, status, created_at, updated_at
         )
         VALUES ($1, 'google_sheets', $2, $3, $4, $5, $6, $7, NULL, NULL, 'registered', $8, $8)
         ON CONFLICT (source_key) DO NOTHING
         RETURNING id`,
        [
          visitId,
          record.sourceKey,
          record.rowNumber,
          record.fullName,
          record.organization,
          record.purpose,
          record.registeredAt,
          syncedAt,
        ],
      )

      if (inserted.rowCount && inserted.rowCount > 0) {
        imported++
        await client.query(
          `INSERT INTO visitor_events (id, visit_id, event_type, occurred_at, source, created_at)
           VALUES ($1, $2, 'registered', $3, 'google_sheets', $4)`,
          [uid('vev'), visitId, record.registeredAt, syncedAt],
        )
      } else {
        unchanged++
      }
    }

    const checkedInCount = await queryCheckedInCount(client)
    const result: VisitorSyncResult = {
      syncedAt,
      spreadsheetId: options.spreadsheetId,
      tabName: options.tabName,
      imported,
      unchanged,
      skippedCount: parsed.skipped.length,
      skipped: parsed.skipped,
      columnMapping: parsed.columnMapping,
      checkedInCount,
    }

    await client.query(
      `INSERT INTO meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [LAST_SYNC_META_KEY, JSON.stringify(result)],
    )

    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function syncVisitorsFromGoogleSheets(): Promise<VisitorSyncResult> {
  const { spreadsheetId, tabName, values } = await fetchGoogleSheetValues()
  return syncVisitorSheetValues(values, { spreadsheetId, tabName })
}

export async function registerWalkIn(input: {
  fullName: string
  organization: string
  purpose: string
  checkInNow: boolean
}): Promise<{ visit: VisitorVisit; checkedInCount: number }> {
  const pool = await ensureVisitorStorage()
  const now = new Date().toISOString()
  const visitId = uid('vis')
  const status = input.checkInNow ? 'checked_in' : 'registered'
  const checkedInAt = input.checkInNow ? now : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query<VisitorVisitRow>(
      `INSERT INTO visitor_visits (
         id, source, source_key, source_row_number, full_name, organization, purpose,
         registered_at, checked_in_at, checked_out_at, status, created_at, updated_at
       )
       VALUES ($1, 'walk_in', NULL, NULL, $2, $3, $4, $5, $6, NULL, $7, $5, $5)
       RETURNING id, source, source_key, source_row_number, full_name, organization, purpose,
                 registered_at, checked_in_at, checked_out_at, status`,
      [visitId, input.fullName, input.organization, input.purpose, now, checkedInAt, status],
    )

    await client.query(
      `INSERT INTO visitor_events (id, visit_id, event_type, occurred_at, source, created_at)
       VALUES ($1, $2, 'registered', $3, 'walk_in', $3)`,
      [uid('vev'), visitId, now],
    )

    if (input.checkInNow) {
      await client.query(
        `INSERT INTO visitor_events (id, visit_id, event_type, occurred_at, source, created_at)
         VALUES ($1, $2, 'checked_in', $3, 'operator', $3)`,
        [uid('vev'), visitId, now],
      )
    }

    const checkedInCount = await queryCheckedInCount(client)
    await client.query('COMMIT')
    return {
      visit: mapVisit(inserted.rows[0]),
      checkedInCount,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function checkInVisit(
  id: string,
): Promise<{ visit: VisitorVisit; alreadyCheckedIn: boolean; checkedInCount: number }> {
  const pool = await ensureVisitorStorage()
  const now = new Date().toISOString()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const updated = await client.query<VisitorVisitRow>(
      `UPDATE visitor_visits
       SET status = 'checked_in',
           checked_in_at = $2,
           updated_at = $2
       WHERE id = $1
         AND status = 'registered'
         AND checked_in_at IS NULL
         AND checked_out_at IS NULL
       RETURNING id, source, source_key, source_row_number, full_name, organization, purpose,
                 registered_at, checked_in_at, checked_out_at, status`,
      [id, now],
    )

    if (updated.rowCount && updated.rowCount > 0) {
      await client.query(
        `INSERT INTO visitor_events (id, visit_id, event_type, occurred_at, source, created_at)
         VALUES ($1, $2, 'checked_in', $3, 'operator', $3)`,
        [uid('vev'), id, now],
      )
      const checkedInCount = await queryCheckedInCount(client)
      await client.query('COMMIT')
      return {
        visit: mapVisit(updated.rows[0]),
        alreadyCheckedIn: false,
        checkedInCount,
      }
    }

    const existing = await client.query<VisitorVisitRow>(
      `SELECT id, source, source_key, source_row_number, full_name, organization, purpose,
              registered_at, checked_in_at, checked_out_at, status
       FROM visitor_visits
       WHERE id = $1`,
      [id],
    )

    if (existing.rowCount === 0) {
      throw new HttpError(404, 'Visitor record not found')
    }

    const row = existing.rows[0]
    if (row.status === 'checked_in') {
      const checkedInCount = await queryCheckedInCount(client)
      await client.query('COMMIT')
      return {
        visit: mapVisit(row),
        alreadyCheckedIn: true,
        checkedInCount,
      }
    }

    throw new HttpError(409, 'This visit has already been checked out')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function checkOutVisit(
  id: string,
): Promise<{ visit: VisitorVisit; alreadyCheckedOut: boolean; checkedInCount: number }> {
  const pool = await ensureVisitorStorage()
  const now = new Date().toISOString()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const updated = await client.query<VisitorVisitRow>(
      `UPDATE visitor_visits
       SET status = 'checked_out',
           checked_out_at = $2,
           updated_at = $2
       WHERE id = $1
         AND status = 'checked_in'
         AND checked_in_at IS NOT NULL
         AND checked_out_at IS NULL
       RETURNING id, source, source_key, source_row_number, full_name, organization, purpose,
                 registered_at, checked_in_at, checked_out_at, status`,
      [id, now],
    )

    if (updated.rowCount && updated.rowCount > 0) {
      await client.query(
        `INSERT INTO visitor_events (id, visit_id, event_type, occurred_at, source, created_at)
         VALUES ($1, $2, 'checked_out', $3, 'operator', $3)`,
        [uid('vev'), id, now],
      )
      const checkedInCount = await queryCheckedInCount(client)
      await client.query('COMMIT')
      return {
        visit: mapVisit(updated.rows[0]),
        alreadyCheckedOut: false,
        checkedInCount,
      }
    }

    const existing = await client.query<VisitorVisitRow>(
      `SELECT id, source, source_key, source_row_number, full_name, organization, purpose,
              registered_at, checked_in_at, checked_out_at, status
       FROM visitor_visits
       WHERE id = $1`,
      [id],
    )

    if (existing.rowCount === 0) {
      throw new HttpError(404, 'Visitor record not found')
    }

    const row = existing.rows[0]
    if (row.status === 'checked_out') {
      const checkedInCount = await queryCheckedInCount(client)
      await client.query('COMMIT')
      return {
        visit: mapVisit(row),
        alreadyCheckedOut: true,
        checkedInCount,
      }
    }

    throw new HttpError(409, 'Visitor must be checked in before checking out')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
