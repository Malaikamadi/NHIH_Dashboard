/**
 * Synthetic end-to-end verification for the NHIH Visitor Register.
 *
 * Runs:
 *  1. Unit tests for Google Sheets column mapping, PII exclusion, skipped-row reporting,
 *     timestamp parsing, and Africa/Freetown formatting.
 *  2. PostgreSQL + Hono API integration tests (when DATABASE_URL & PERSISTENCE=postgres are set):
 *     - Operator auth hardening (rejects unauthenticated requests and default "nhih-ops" code)
 *     - Public /api/visitors/summary exposes ONLY aggregate count
 *     - Importing registrations leaves checked-in count unchanged
 *     - Check-in increases count, walk-in check-in increases count, checkout decreases count
 *     - Simultaneous & repeated checkouts are safe and preserve original checkout timestamp
 *     - Re-syncing preserves existing attendance and prevents duplicates
 */
import assert from 'node:assert/strict'
import { app } from '../server/app'
import {
  parseSheetRows,
  parseSubmissionTimestamp,
  resolveColumnMapping,
} from '../server/google-sheets'
import { DEFAULT_OPERATOR_CODE } from '../server/operator'
import { getPostgresPool, migratePostgres, postgresActive } from '../server/postgres'
import { syncVisitorSheetValues } from '../server/visitors'
import { formatFreetownDateTime, formatFreetownTime } from '../src/utils/time'

const TEST_SPREADSHEET_ID = 'synthetic-sheet-test-001'
const TEST_TAB = 'Form Responses 1'
const TEST_OPERATOR_CODE = 'test-operator-secret-2026'

const SYNTHETIC_SHEET_ROWS: string[][] = [
  [
    'Timestamp',
    'Full Name',
    'Email Address',
    'Phone Number',
    'Organization or Unit',
    'Purpose of Visit',
    'Time In',
    'Time Out',
  ],
  [
    '11/20/2026 9:15:00',
    'Aminata Kamara',
    'aminata@example.org',
    '+23276111222',
    'Ministry of Health — DHIS2 Unit',
    'Monthly data review',
    '09:15',
    '',
  ],
  [
    '11/20/2026 10:05:30',
    'Mohamed Sesay',
    'msesay@example.org',
    '+23277999888',
    'WHO Sierra Leone',
    'EMR interoperability briefing',
    '10:05',
    '11:30',
  ],
  // Missing full name -> should be skipped
  [
    '11/20/2026 10:30:00',
    '   ',
    'blank@example.org',
    '+23277000000',
    'ICAP',
    'Follow-up',
    '',
    '',
  ],
  // Invalid timestamp -> should be skipped
  [
    'not-a-timestamp',
    'Kadiatu Bangura',
    'kadiatu@example.org',
    '+23278123456',
    'UNICEF',
    'Immunization dashboard sync',
    '',
    '',
  ],
  // Completely blank trailing row -> silently ignored
  ['', '', '', '', '', '', '', ''],
]

function runUnitTests(): void {
  console.log('1. Running unit tests (column mapping, PII exclusion, timestamps, Africa/Freetown)…')

  const parsed = parseSheetRows(SYNTHETIC_SHEET_ROWS, {
    spreadsheetId: TEST_SPREADSHEET_ID,
    tabName: TEST_TAB,
  })

  assert.equal(parsed.columnMapping.timestamp, 'Timestamp')
  assert.equal(parsed.columnMapping.fullName, 'Full Name')
  assert.equal(parsed.columnMapping.organization, 'Organization or Unit')
  assert.equal(parsed.columnMapping.purpose, 'Purpose of Visit')
  assert.deepEqual(parsed.columnMapping.ignoredColumns, [
    'Email Address',
    'Phone Number',
    'Time In',
    'Time Out',
  ])

  assert.equal(parsed.records.length, 2, 'Expected 2 valid registrations')
  assert.equal(parsed.skipped.length, 2, 'Expected 2 skipped rows')
  assert.equal(parsed.skipped[0].rowNumber, 4)
  assert.match(parsed.skipped[0].reason, /Missing full name/i)
  assert.equal(parsed.skipped[1].rowNumber, 5)
  assert.match(parsed.skipped[1].reason, /Unrecognized submission timestamp/i)

  // Verify no email/phone fields exist anywhere on parsed records
  const serialized = JSON.stringify(parsed.records)
  assert.ok(!serialized.includes('aminata@example.org'), 'Email must not be imported')
  assert.ok(!serialized.includes('+23276111222'), 'Phone must not be imported')

  // Verify missing required column throws 422
  assert.throws(
    () => resolveColumnMapping(['Timestamp', 'Email Address', 'Phone Number']),
    /column mapping verification failed/i,
  )

  // Verify timestamp parsing & Africa/Freetown display
  const iso = parseSubmissionTimestamp('11/20/2026 9:15:00')
  assert.equal(iso, '2026-11-20T09:15:00.000Z')
  assert.equal(formatFreetownTime(iso), '09:15')
  assert.match(formatFreetownDateTime(iso), /20 Nov 2026.*09:15/)

  console.log('   ✓ Unit tests passed')
}

async function runIntegrationTests(): Promise<void> {
  if (!postgresActive()) {
    console.log('2. Skipping PostgreSQL integration tests (PERSISTENCE=postgres and DATABASE_URL not set)')
    return
  }

  console.log('2. Running PostgreSQL + API integration tests…')
  await migratePostgres()
  const pool = getPostgresPool()

  // Clean visitor tables before test run
  await pool.query(`DELETE FROM visitor_events`)
  await pool.query(`DELETE FROM visitor_visits`)
  await pool.query(`DELETE FROM meta WHERE key = 'visitor_last_sync'`)

  // --- Auth hardening: unset / default OPERATOR_CODE must be rejected ---
  const prevCode = process.env.OPERATOR_CODE
  try {
    process.env.OPERATOR_CODE = DEFAULT_OPERATOR_CODE
    const defaultServerRes = await app.request('/api/visitors', {
      headers: { 'X-Operator-Code': DEFAULT_OPERATOR_CODE },
    })
    assert.equal(
      defaultServerRes.status,
      503,
      'Visitor register must reject requests when server uses default OPERATOR_CODE',
    )

    delete process.env.OPERATOR_CODE
    const unsetServerRes = await app.request('/api/visitors', {
      headers: { 'X-Operator-Code': DEFAULT_OPERATOR_CODE },
    })
    assert.equal(
      unsetServerRes.status,
      503,
      'Visitor register must reject requests when OPERATOR_CODE is unset',
    )

    // Configure non-default operator code
    process.env.OPERATOR_CODE = TEST_OPERATOR_CODE

    // Unauthenticated access checks
    const summaryRes = await app.request('/api/visitors/summary')
    assert.equal(summaryRes.status, 200, 'Public summary must succeed without auth')
    const summaryBody = (await summaryRes.json()) as Record<string, unknown>
    assert.deepEqual(Object.keys(summaryBody).sort(), ['activePurposes', 'checkedInCount', 'updatedAt'])
    assert.equal(summaryBody.checkedInCount, 0)
    assert.deepEqual(summaryBody.activePurposes, [])

    for (const [method, path] of [
      ['GET', '/api/visitors'],
      ['POST', '/api/visitors/sync'],
      ['POST', '/api/visitors/walk-in'],
      ['POST', '/api/visitors/fake-id/check-in'],
      ['POST', '/api/visitors/fake-id/check-out'],
    ] as const) {
      const noAuth = await app.request(path, { method })
      assert.equal(noAuth.status, 401, `${method} ${path} must reject unauthenticated requests`)
      const defaultAuth = await app.request(path, {
        method,
        headers: { 'X-Operator-Code': DEFAULT_OPERATOR_CODE },
      })
      assert.equal(defaultAuth.status, 401, `${method} ${path} must reject default operator code`)
    }
    console.log('   ✓ Auth hardening & public summary isolation verified')

    const authHeaders = {
      'Content-Type': 'application/json',
      'X-Operator-Code': TEST_OPERATOR_CODE,
    }

    // --- Import synthetic Google Sheet registrations ---
    const firstSync = await syncVisitorSheetValues(SYNTHETIC_SHEET_ROWS, {
      spreadsheetId: TEST_SPREADSHEET_ID,
      tabName: TEST_TAB,
    })
    assert.equal(firstSync.imported, 2)
    assert.equal(firstSync.unchanged, 0)
    assert.equal(firstSync.skippedCount, 2)
    assert.equal(firstSync.checkedInCount, 0, 'Importing registrations must leave count unchanged')

    const summaryAfterImport = (await (await app.request('/api/visitors/summary')).json()) as {
      checkedInCount: number
    }
    assert.equal(summaryAfterImport.checkedInCount, 0)

    const registerRes = await app.request('/api/visitors', { headers: authHeaders })
    assert.equal(registerRes.status, 200)
    const registerBody = (await registerRes.json()) as {
      checkedInCount: number
      registeredCount: number
      visits: Array<{
        id: string
        fullName: string
        organization: string
        purpose: string
        status: string
        checkedInAt?: string
        checkedOutAt?: string
      }>
    }
    assert.equal(registerBody.checkedInCount, 0)
    assert.equal(registerBody.registeredCount, 2)
    const aminata = registerBody.visits.find((v) => v.fullName === 'Aminata Kamara')
    const mohamed = registerBody.visits.find((v) => v.fullName === 'Mohamed Sesay')
    assert.ok(aminata && mohamed)
    assert.equal(aminata.status, 'registered')
    assert.equal(mohamed.status, 'registered', 'Historical Time In must not auto-check-in')
    console.log('   ✓ Importing registrations leaves checked-in count at 0')

    // Checking out a registered-only visitor must be rejected (409)
    const prematureCheckout = await app.request(`/api/visitors/${aminata.id}/check-out`, {
      method: 'POST',
      headers: authHeaders,
    })
    assert.equal(prematureCheckout.status, 409)

    // --- Check-in increases count (0 -> 1) ---
    const checkInRes = await app.request(`/api/visitors/${aminata.id}/check-in`, {
      method: 'POST',
      headers: authHeaders,
    })
    assert.equal(checkInRes.status, 200)
    const checkInBody = (await checkInRes.json()) as {
      checkedInCount: number
      visit: { status: string; checkedInAt?: string }
    }
    assert.equal(checkInBody.checkedInCount, 1)
    assert.equal(checkInBody.visit.status, 'checked_in')
    assert.ok(checkInBody.visit.checkedInAt)

    // --- Walk-in registration with immediate check-in increases count (1 -> 2) ---
    const walkInRes = await app.request('/api/visitors/walk-in', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fullName: 'Ibrahim Koroma',
        organization: 'Bo District Health Office',
        purpose: 'DHIS2 reporting support',
        checkInNow: true,
      }),
    })
    assert.equal(walkInRes.status, 201)
    const walkInBody = (await walkInRes.json()) as {
      checkedInCount: number
      visit: { id: string; status: string; checkedInAt?: string }
    }
    assert.equal(walkInBody.checkedInCount, 2)
    assert.equal(walkInBody.visit.status, 'checked_in')

    // Public summary must still expose ONLY aggregate count (2) and active purposes, never names
    const publicSummary2 = await (await app.request('/api/visitors/summary')).text()
    assert.ok(!publicSummary2.includes('Aminata') && !publicSummary2.includes('Ibrahim'))
    const parsedSummary2 = JSON.parse(publicSummary2) as {
      checkedInCount: number
      activePurposes: string[]
    }
    assert.equal(parsedSummary2.checkedInCount, 2)
    assert.ok(parsedSummary2.activePurposes.includes('Monthly data review'))
    assert.ok(parsedSummary2.activePurposes.includes('DHIS2 reporting support'))
    console.log('   ✓ Check-in and walk-in check-in increase count (0 → 1 → 2)')

    // --- Simultaneous & repeated checkout decreases count safely (2 -> 1) ---
    const [co1, co2, co3] = await Promise.all([
      app.request(`/api/visitors/${aminata.id}/check-out`, { method: 'POST', headers: authHeaders }),
      app.request(`/api/visitors/${aminata.id}/check-out`, { method: 'POST', headers: authHeaders }),
      app.request(`/api/visitors/${aminata.id}/check-out`, { method: 'POST', headers: authHeaders }),
    ])
    assert.equal(co1.status, 200)
    assert.equal(co2.status, 200)
    assert.equal(co3.status, 200)

    const coBodies = (await Promise.all([co1.json(), co2.json(), co3.json()])) as Array<{
      checkedInCount: number
      alreadyCheckedOut: boolean
      visit: { status: string; checkedInAt?: string; checkedOutAt?: string }
    }>
    const firstCheckouts = coBodies.filter((b) => !b.alreadyCheckedOut)
    assert.equal(firstCheckouts.length, 1, 'Exactly one concurrent checkout should perform the transition')
    const canonicalCheckedOutAt = firstCheckouts[0].visit.checkedOutAt
    assert.ok(canonicalCheckedOutAt)
    for (const body of coBodies) {
      assert.equal(body.checkedInCount, 1)
      assert.equal(body.visit.status, 'checked_out')
      assert.equal(body.visit.checkedOutAt, canonicalCheckedOutAt)
      assert.ok(body.visit.checkedInAt)
    }

    // Verify only one checked_out event was recorded in visitor_events
    const checkoutEvents = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM visitor_events WHERE visit_id = $1 AND event_type = 'checked_out'`,
      [aminata.id],
    )
    assert.equal(Number(checkoutEvents.rows[0].count), 1)
    console.log('   ✓ Simultaneous & repeated checkouts safely decrease count (2 → 1) and preserve timestamps')

    // --- Re-sync preserves attendance & avoids duplicates ---
    const updatedSheetRows = [
      ...SYNTHETIC_SHEET_ROWS,
      [
        '11/20/2026 11:45:00',
        'Mariama Conteh',
        'mariama@example.org',
        '+23279555444',
        'Kambia DHMT',
        'Facility registry update',
        '',
        '',
      ],
    ]
    const secondSync = await syncVisitorSheetValues(updatedSheetRows, {
      spreadsheetId: TEST_SPREADSHEET_ID,
      tabName: TEST_TAB,
    })
    assert.equal(secondSync.imported, 1, 'Only the 1 new registration should be imported')
    assert.equal(secondSync.unchanged, 2, 'The 2 existing registrations must remain unchanged')
    assert.equal(secondSync.skippedCount, 2)
    assert.equal(secondSync.checkedInCount, 1, 'Re-sync must preserve current checked-in count')

    const registerAfterResync = (await (
      await app.request('/api/visitors', { headers: authHeaders })
    ).json()) as {
      checkedInCount: number
      visits: Array<{ id: string; fullName: string; status: string; checkedInAt?: string; checkedOutAt?: string }>
    }
    assert.equal(registerAfterResync.visits.length, 4, 'No duplicate visits should be created (3 sheet + 1 walk-in)')
    const aminataAfter = registerAfterResync.visits.find((v) => v.id === aminata.id)
    assert.equal(aminataAfter?.status, 'checked_out')
    assert.equal(aminataAfter?.checkedOutAt, canonicalCheckedOutAt)
    console.log('   ✓ Re-sync preserves attendance records and prevents duplicates')
  } finally {
    if (prevCode === undefined) delete process.env.OPERATOR_CODE
    else process.env.OPERATOR_CODE = prevCode
    // Clean up synthetic test records
    await pool.query(`DELETE FROM visitor_events`)
    await pool.query(`DELETE FROM visitor_visits`)
    await pool.query(`DELETE FROM meta WHERE key = 'visitor_last_sync'`)
    await pool.end()
  }
}

runUnitTests()
await runIntegrationTests()
console.log('All visitor register tests passed.')
