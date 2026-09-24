import { readFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import type {
  ActionItem,
  ActivityEvent,
  HubLogEntry,
  Meeting,
  OpsState,
  Task,
  TeamActivity,
  TeamMember,
} from '../src/types'
import { assigneeIds } from '../src/utils/metrics'
import { districtIds } from '../src/data/catalog'
import { SEED_VERSION, type Snapshot, type SnapshotRead } from './snapshot'

const { Pool } = pg

let pool: pg.Pool | null = null

export function postgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

/** Local-only Postgres mode. Never used on Vercel unless explicitly forced. */
export function postgresActive(): boolean {
  if (process.env.VERCEL && process.env.FORCE_POSTGRES !== '1') return false
  const mode = (process.env.PERSISTENCE || '').trim().toLowerCase()
  return mode === 'postgres' && postgresConfigured()
}

function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim()
    if (!connectionString) throw new Error('DATABASE_URL is not set')
    pool = new Pool({ connectionString })
  }
  return pool
}

export async function migratePostgres(): Promise<void> {
  const sql = readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8')
  await getPool().query(sql)
  await getPool().query(
    `ALTER TABLE hub_log ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'`,
  )
  // Multi-assignee / multi-district: store JSON arrays in TEXT columns.
  await getPool().query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey`)
  await getPool().query(
    `ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_assigned_to_fkey`,
  )
  await getPool().query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS emr_phase TEXT`)
}

export async function readPostgresSnapshot(): Promise<SnapshotRead> {
  try {
    await migratePostgres()
    const client = await getPool().connect()
    try {
      const versionRes = await client.query<{ value: string }>(
        `SELECT value FROM meta WHERE key = 'seed_version'`,
      )
      const membersRes = await client.query<MemberRow>(`SELECT * FROM members ORDER BY id`)
      if (membersRes.rowCount === 0 && versionRes.rowCount === 0) {
        return { ok: false, missing: true }
      }

      const [tasks, meetings, activities, actionItems, hubLog, events] = await Promise.all([
        client.query<TaskRow>(`SELECT * FROM tasks ORDER BY created_at DESC`),
        client.query<MeetingRow>(`SELECT * FROM meetings ORDER BY start_time`),
        client.query<ActivityRow>(`SELECT * FROM activities ORDER BY start_time`),
        client.query<ActionRow>(`SELECT * FROM action_items ORDER BY deadline`),
        client.query<HubLogRow>(`SELECT * FROM hub_log ORDER BY at DESC`),
        client.query<EventRow>(`SELECT * FROM activity_events ORDER BY at DESC`),
      ])

      const meetingParts = await client.query<{ meeting_id: string; member_id: string }>(
        `SELECT meeting_id, member_id FROM meeting_participants`,
      )
      const activityParts = await client.query<{ activity_id: string; member_id: string }>(
        `SELECT activity_id, member_id FROM activity_participants`,
      )

      const meetingMap = groupIds(meetingParts.rows, 'meeting_id', 'member_id')
      const activityMap = groupIds(activityParts.rows, 'activity_id', 'member_id')

      const state: OpsState = {
        members: membersRes.rows.map(mapMember),
        tasks: tasks.rows.map(mapTask),
        meetings: meetings.rows.map((row) => mapMeeting(row, meetingMap.get(row.id) ?? [])),
        activities: activities.rows.map((row) => mapActivity(row, activityMap.get(row.id) ?? [])),
        actionItems: actionItems.rows.map(mapAction),
        hubLog: hubLog.rows.map(mapHubLog),
        events: events.rows.map(mapEvent),
      }

      return {
        ok: true,
        snapshot: {
          version: versionRes.rows[0]?.value ?? SEED_VERSION,
          state,
        },
      }
    } finally {
      client.release()
    }
  } catch (error) {
    return {
      ok: false,
      missing: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function writePostgresSnapshot(snapshot: Snapshot): Promise<void> {
  await migratePostgres()
  const client = await getPool().connect()
  const { state, version } = snapshot
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM activity_events`)
    await client.query(`DELETE FROM hub_log`)
    await client.query(`DELETE FROM action_items`)
    await client.query(`DELETE FROM activity_participants`)
    await client.query(`DELETE FROM activities`)
    await client.query(`DELETE FROM meeting_participants`)
    await client.query(`DELETE FROM meetings`)
    await client.query(`DELETE FROM tasks`)
    await client.query(`DELETE FROM members`)
    await client.query(
      `INSERT INTO meta (key, value) VALUES ('seed_version', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [version],
    )

    for (const member of state.members) {
      await client.query(
        `INSERT INTO members (id, name, role, initials) VALUES ($1, $2, $3, $4)`,
        [member.id, member.name, member.role, member.initials],
      )
    }

    for (const task of state.tasks) {
      await client.query(
        `INSERT INTO tasks (
          id, title, description, assigned_to, assigned_by, priority, due_date, status,
          progress, created_at, completed_at, from_action_item_id, work_kind, work_kind_other,
          district, facility, emr_phase
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
        )`,
        [
          task.id,
          task.title,
          task.description,
          JSON.stringify(assigneeIds(task.assignedTo)),
          task.assignedBy,
          task.priority,
          task.dueDate,
          task.status,
          task.progress,
          task.createdAt,
          task.completedAt ?? null,
          task.fromActionItemId ?? null,
          task.workKind,
          task.workKindOther ?? null,
          JSON.stringify(districtIds(task.district)),
          task.facility ?? null,
          task.emrPhase ?? null,
        ],
      )
    }

    for (const meeting of state.meetings) {
      await client.query(
        `INSERT INTO meetings (id, title, start_time, end_time, agenda, notes, rolling)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          meeting.id,
          meeting.title,
          meeting.startTime,
          meeting.endTime,
          meeting.agenda ?? null,
          meeting.notes ?? null,
          Boolean(meeting.rolling),
        ],
      )
      for (const memberId of meeting.participantIds) {
        await client.query(
          `INSERT INTO meeting_participants (meeting_id, member_id) VALUES ($1, $2)`,
          [meeting.id, memberId],
        )
      }
    }

    for (const activity of state.activities ?? []) {
      await client.query(
        `INSERT INTO activities (
          id, title, kind, kind_other, start_time, end_time, district, facility, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          activity.id,
          activity.title,
          activity.kind,
          activity.kindOther ?? null,
          activity.startTime,
          activity.endTime,
          activity.district,
          activity.facility ?? null,
          activity.notes ?? null,
        ],
      )
      for (const memberId of activity.participantIds) {
        await client.query(
          `INSERT INTO activity_participants (activity_id, member_id) VALUES ($1, $2)`,
          [activity.id, memberId],
        )
      }
    }

    for (const item of state.actionItems) {
      await client.query(
        `INSERT INTO action_items (
          id, meeting_id, meeting_title, title, assigned_to, deadline, status,
          converted_to_task_id, work_kind, work_kind_other, district, facility
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          item.id,
          item.meetingId,
          item.meetingTitle,
          item.title,
          JSON.stringify(assigneeIds(item.assignedTo)),
          item.deadline,
          item.status,
          item.convertedToTaskId ?? null,
          item.workKind,
          item.workKindOther ?? null,
          JSON.stringify(districtIds(item.district)),
          item.facility ?? null,
        ],
      )
    }

    for (const entry of state.hubLog ?? []) {
      await client.query(
        `INSERT INTO hub_log (id, at, kind, status, title, detail, district, facility, author_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          entry.id,
          entry.at,
          entry.kind,
          entry.status ??
            (entry.kind === 'extract_restored'
              ? 'completed'
              : entry.kind === 'extract_failed' || entry.kind === 'late_reporting'
                ? 'overdue'
                : 'open'),
          entry.title,
          entry.detail,
          entry.district,
          entry.facility ?? null,
          entry.authorId,
        ],
      )
    }

    for (const event of state.events) {
      await client.query(
        `INSERT INTO activity_events (id, at, message, tone) VALUES ($1,$2,$3,$4)`,
        [event.id, event.at, event.message, event.tone],
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function postgresCounts(): Promise<Record<string, number>> {
  const client = await getPool().connect()
  try {
    const tables = [
      'members',
      'tasks',
      'meetings',
      'activities',
      'action_items',
      'hub_log',
      'activity_events',
    ] as const
    const out: Record<string, number> = {}
    for (const table of tables) {
      const res = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`)
      out[table] = Number(res.rows[0]?.count ?? 0)
    }
    return out
  } finally {
    client.release()
  }
}

function groupIds<T extends Record<string, string>>(
  rows: T[],
  parentKey: keyof T,
  childKey: keyof T,
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const parent = row[parentKey]
    const child = row[childKey]
    const list = map.get(parent) ?? []
    list.push(child)
    map.set(parent, list)
  }
  return map
}

type MemberRow = { id: string; name: string; role: string; initials: string }
type TaskRow = {
  id: string
  title: string
  description: string
  assigned_to: string
  assigned_by: string
  priority: string
  due_date: Date
  status: string
  progress: number
  created_at: Date
  completed_at: Date | null
  from_action_item_id: string | null
  work_kind: string
  work_kind_other: string | null
  district: string
  facility: string | null
  emr_phase: string | null
}
type MeetingRow = {
  id: string
  title: string
  start_time: Date
  end_time: Date
  agenda: string | null
  notes: string | null
  rolling: boolean
}
type ActivityRow = {
  id: string
  title: string
  kind: string
  kind_other: string | null
  start_time: Date
  end_time: Date
  district: string
  facility: string | null
  notes: string | null
}
type ActionRow = {
  id: string
  meeting_id: string
  meeting_title: string
  title: string
  assigned_to: string
  deadline: Date
  status: string
  converted_to_task_id: string | null
  work_kind: string
  work_kind_other: string | null
  district: string
  facility: string | null
}
type HubLogRow = {
  id: string
  at: Date
  kind: string
  status: string | null
  title: string
  detail: string
  district: string
  facility: string | null
  author_id: string
}
type EventRow = { id: string; at: Date; message: string; tone: string }

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

function mapMember(row: MemberRow): TeamMember {
  return { id: row.id, name: row.name, role: row.role, initials: row.initials }
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    assignedTo: assigneeIds(row.assigned_to),
    assignedBy: row.assigned_by,
    priority: row.priority as Task['priority'],
    dueDate: iso(row.due_date),
    status: row.status as Task['status'],
    progress: row.progress,
    createdAt: iso(row.created_at),
    completedAt: row.completed_at ? iso(row.completed_at) : undefined,
    fromActionItemId: row.from_action_item_id ?? undefined,
    workKind: row.work_kind as Task['workKind'],
    workKindOther: row.work_kind_other ?? undefined,
    district: districtIds(row.district),
    facility: row.facility ?? undefined,
    emrPhase: row.emr_phase ?? undefined,
  }
}

function mapMeeting(row: MeetingRow, participantIds: string[]): Meeting {
  return {
    id: row.id,
    title: row.title,
    startTime: iso(row.start_time),
    endTime: iso(row.end_time),
    participantIds,
    agenda: row.agenda ?? undefined,
    notes: row.notes ?? undefined,
    rolling: row.rolling || undefined,
  }
}

function mapActivity(row: ActivityRow, participantIds: string[]): TeamActivity {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as TeamActivity['kind'],
    kindOther: row.kind_other ?? undefined,
    startTime: iso(row.start_time),
    endTime: iso(row.end_time),
    participantIds,
    district: row.district as TeamActivity['district'],
    facility: row.facility ?? undefined,
    notes: row.notes ?? undefined,
  }
}

function mapAction(row: ActionRow): ActionItem {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    meetingTitle: row.meeting_title,
    title: row.title,
    assignedTo: assigneeIds(row.assigned_to),
    deadline: iso(row.deadline),
    status: row.status as ActionItem['status'],
    convertedToTaskId: row.converted_to_task_id ?? undefined,
    workKind: row.work_kind as ActionItem['workKind'],
    workKindOther: row.work_kind_other ?? undefined,
    district: districtIds(row.district),
    facility: row.facility ?? undefined,
  }
}

function mapHubLog(row: HubLogRow): HubLogEntry {
  const kind = row.kind as HubLogEntry['kind']
  return {
    id: row.id,
    at: iso(row.at),
    kind,
    status: (row.status as HubLogEntry['status']) ??
      (kind === 'extract_restored'
        ? 'completed'
        : kind === 'extract_failed' || kind === 'late_reporting'
          ? 'overdue'
          : 'open'),
    title: row.title,
    detail: row.detail,
    district: row.district as HubLogEntry['district'],
    facility: row.facility ?? undefined,
    authorId: row.author_id,
  }
}

function mapEvent(row: EventRow): ActivityEvent {
  return {
    id: row.id,
    at: iso(row.at),
    message: row.message,
    tone: row.tone as ActivityEvent['tone'],
  }
}
