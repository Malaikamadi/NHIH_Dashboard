/**
 * Import a Redis ops snapshot JSON into local PostgreSQL.
 * Read-only toward Redis — uses a local backup file only.
 *
 * Usage: npx tsx scripts/import-ops-to-postgres.ts [path-to-backup.json]
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import '../server/env'
import { postgresActive, postgresCounts, writePostgresSnapshot } from '../server/postgres'
import { SEED_VERSION, type Snapshot } from '../server/snapshot'

async function main() {
  if (!postgresActive()) {
    console.error(
      'Refusing to import: set PERSISTENCE=postgres and DATABASE_URL in .env.local (local only).',
    )
    process.exit(1)
  }

  const file =
    process.argv[2] ?? path.join(process.cwd(), 'backups', 'nhih-ops-state-latest.json')
  const raw = readFileSync(file, 'utf8')
  const parsed = JSON.parse(raw) as Snapshot
  if (!parsed?.state) {
    console.error('Invalid snapshot: missing state')
    process.exit(1)
  }

  const snapshot: Snapshot = {
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

  const before = {
    members: snapshot.state.members.length,
    tasks: snapshot.state.tasks.length,
    meetings: snapshot.state.meetings.length,
    activities: snapshot.state.activities.length,
    actionItems: snapshot.state.actionItems.length,
    hubLog: snapshot.state.hubLog.length,
    events: snapshot.state.events.length,
  }

  await writePostgresSnapshot(snapshot)
  const after = await postgresCounts()

  console.log('Imported from', file)
  console.log('Snapshot counts:', before)
  console.log('Postgres counts:', {
    members: after.members,
    tasks: after.tasks,
    meetings: after.meetings,
    activities: after.activities,
    action_items: after.action_items,
    hub_log: after.hub_log,
    activity_events: after.activity_events,
  })

  const ok =
    after.members === before.members &&
    after.tasks === before.tasks &&
    after.meetings === before.meetings &&
    after.activities === before.activities &&
    after.action_items === before.actionItems &&
    after.hub_log === before.hubLog &&
    after.activity_events === before.events

  if (!ok) {
    console.error('Count mismatch after import')
    process.exit(1)
  }
  console.log('Import verified OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
