/**
 * Docker boot: wait for Postgres, migrate schema, seed from existing
 * data/ops-state.json (or backups) when the DB is empty, then start the API.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import '../server/env'
import {
  migratePostgres,
  postgresActive,
  postgresCounts,
  writePostgresSnapshot,
} from '../server/postgres'
import { SEED_VERSION, type Snapshot } from '../server/snapshot'
import { hubHasWork } from '../src/utils/hub'

const RETRIES = 40
const DELAY_MS = 2000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForDatabase(): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      await migratePostgres()
      console.log('[docker] Postgres schema ready')
      return
    } catch (error) {
      lastError = error
      console.log(`[docker] Waiting for Postgres… (${attempt}/${RETRIES})`)
      await sleep(DELAY_MS)
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Postgres not ready: ${String(lastError)}`)
}

function loadSnapshotFile(file: string): Snapshot | null {
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Snapshot
    if (!parsed?.state) return null
    return {
      version: typeof parsed.version === 'string' ? parsed.version : SEED_VERSION,
      state: {
        members: parsed.state.members ?? [],
        tasks: parsed.state.tasks ?? [],
        meetings: parsed.state.meetings ?? [],
        activities: parsed.state.activities ?? [],
        actionItems: parsed.state.actionItems ?? [],
        hubLog: parsed.state.hubLog ?? [],
        events: parsed.state.events ?? [],
      },
    }
  } catch (error) {
    console.warn(`[docker] Could not read ${file}:`, error)
    return null
  }
}

function pickSeedSnapshot(): { file: string; snapshot: Snapshot } | null {
  const candidates = [
    path.join(process.cwd(), 'data', 'ops-state.json'),
    path.join(process.cwd(), 'backups', 'nhih-ops-state-latest.json'),
  ]

  let best: { file: string; snapshot: Snapshot; score: number } | null = null
  for (const file of candidates) {
    const snapshot = loadSnapshotFile(file)
    if (!snapshot) continue
    const { state } = snapshot
    const score =
      (state.tasks?.length ?? 0) +
      (state.meetings?.length ?? 0) +
      (state.activities?.length ?? 0) +
      (state.actionItems?.length ?? 0) +
      (state.hubLog?.length ?? 0) +
      (state.members?.length ?? 0)
    if (!hubHasWork(state) && !(state.members?.length > 0)) continue
    if (!best || score > best.score) best = { file, snapshot, score }
  }
  return best ? { file: best.file, snapshot: best.snapshot } : null
}

async function seedIfEmpty(): Promise<void> {
  const counts = await postgresCounts()
  const hasRows =
    counts.members > 0 ||
    counts.tasks > 0 ||
    counts.meetings > 0 ||
    counts.activities > 0 ||
    counts.action_items > 0 ||
    counts.hub_log > 0

  if (hasRows) {
    console.log('[docker] Postgres already has data — keeping it', counts)
    return
  }

  const seed = pickSeedSnapshot()
  if (!seed) {
    console.log('[docker] No local snapshot found; app will create a fresh seed on first request')
    return
  }

  await writePostgresSnapshot(seed.snapshot)
  const after = await postgresCounts()
  console.log(`[docker] Seeded Postgres from ${seed.file}`, after)
}

async function main() {
  if (!postgresActive()) {
    console.error(
      '[docker] Set PERSISTENCE=postgres and DATABASE_URL (see docker-compose.yml).',
    )
    process.exit(1)
  }

  await waitForDatabase()
  await seedIfEmpty()

  console.log('[docker] Starting NHIH ops API…')
  await import('../server/index.ts')
}

main().catch((error) => {
  console.error('[docker] Boot failed:', error)
  process.exit(1)
})
