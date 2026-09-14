import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { buildSeed } from '../src/data/seed'
import type {
  ActionItem,
  ActivityEvent,
  HubLogEntry,
  Meeting,
  OpsState,
  Task,
  TeamMember,
} from '../src/types'
import { displayStatus, memberName } from '../src/utils/metrics'
import { atTime, nowIso, uid } from '../src/utils/time'
import { HttpError } from './errors'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'ops.db')

fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    initials TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    assigned_to TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    priority TEXT NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    from_action_item_id TEXT
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    rolling INTEGER NOT NULL DEFAULT 0,
    participant_ids TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS action_items (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    meeting_title TEXT NOT NULL,
    title TEXT NOT NULL,
    assigned_to TEXT NOT NULL,
    deadline TEXT NOT NULL,
    status TEXT NOT NULL,
    converted_to_task_id TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    message TEXT NOT NULL,
    tone TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hub_log (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    district TEXT NOT NULL DEFAULT 'national',
    facility TEXT NOT NULL DEFAULT '',
    author_id TEXT NOT NULL
  );
`)

function ensureColumn(table: string, name: string, spec: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((col) => col.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${spec}`)
  }
}
ensureColumn('tasks', 'work_kind', `TEXT NOT NULL DEFAULT 'facility_followup'`)
ensureColumn('tasks', 'district', `TEXT NOT NULL DEFAULT 'national'`)
ensureColumn('tasks', 'facility', `TEXT NOT NULL DEFAULT ''`)
ensureColumn('action_items', 'work_kind', `TEXT NOT NULL DEFAULT 'facility_followup'`)
ensureColumn('action_items', 'district', `TEXT NOT NULL DEFAULT 'national'`)
ensureColumn('action_items', 'facility', `TEXT NOT NULL DEFAULT ''`)
ensureColumn('meetings', 'agenda', `TEXT NOT NULL DEFAULT ''`)

const insertMember = db.prepare(
  `INSERT INTO members (id, name, role, initials) VALUES (@id, @name, @role, @initials)`,
)
const insertTask = db.prepare(
  `INSERT INTO tasks (
    id, title, description, assigned_to, assigned_by, priority, due_date, status, progress, created_at, completed_at, from_action_item_id, work_kind, district, facility
  ) VALUES (
    @id, @title, @description, @assignedTo, @assignedBy, @priority, @dueDate, @status, @progress, @createdAt, @completedAt, @fromActionItemId, @workKind, @district, @facility
  )`,
)
const insertMeeting = db.prepare(
  `INSERT INTO meetings (id, title, start_time, end_time, notes, agenda, rolling, participant_ids)
   VALUES (@id, @title, @startTime, @endTime, @notes, @agenda, @rolling, @participantIds)`,
)
const insertAction = db.prepare(
  `INSERT INTO action_items (
    id, meeting_id, meeting_title, title, assigned_to, deadline, status, converted_to_task_id, work_kind, district, facility
  ) VALUES (
    @id, @meetingId, @meetingTitle, @title, @assignedTo, @deadline, @status, @convertedToTaskId, @workKind, @district, @facility
  )`,
)
const insertEvent = db.prepare(
  `INSERT INTO events (id, at, message, tone) VALUES (@id, @at, @message, @tone)`,
)
const insertHubLog = db.prepare(
  `INSERT INTO hub_log (id, at, kind, title, detail, district, facility, author_id)
   VALUES (@id, @at, @kind, @title, @detail, @district, @facility, @authorId)`,
)

function rowTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ''),
    assignedTo: String(row.assigned_to),
    assignedBy: String(row.assigned_by),
    priority: row.priority as Task['priority'],
    dueDate: String(row.due_date),
    status: row.status as Task['status'],
    progress: Number(row.progress),
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    fromActionItemId: row.from_action_item_id ? String(row.from_action_item_id) : undefined,
    workKind: (row.work_kind as Task['workKind']) || 'facility_followup',
    district: (row.district as Task['district']) || 'national',
    facility: String(row.facility ?? '') || undefined,
  }
}

function rowMeeting(row: Record<string, unknown>, now: Date): Meeting {
  const startTime = String(row.start_time)
  const endTime = String(row.end_time)
  const rolling = Boolean(row.rolling)
  if (!rolling) {
    return {
      id: String(row.id),
      title: String(row.title),
      startTime,
      endTime,
      notes: String(row.notes ?? ''),
      agenda: String(row.agenda ?? ''),
      rolling,
      participantIds: JSON.parse(String(row.participant_ids || '[]')) as string[],
    }
  }
  const start = new Date(startTime)
  const end = new Date(endTime)
  return {
    id: String(row.id),
    title: String(row.title),
    startTime: atTime(now, start.getHours(), start.getMinutes()).toISOString(),
    endTime: atTime(now, end.getHours(), end.getMinutes()).toISOString(),
    notes: String(row.notes ?? ''),
    agenda: String(row.agenda ?? ''),
    rolling,
    participantIds: JSON.parse(String(row.participant_ids || '[]')) as string[],
  }
}

function logEvent(message: string, tone: ActivityEvent['tone']): void {
  insertEvent.run({
    id: uid('e'),
    at: nowIso(),
    message,
    tone,
  })
  db.prepare(
    `DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY at DESC LIMIT 12)`,
  ).run()
}

const replaceAll = db.transaction((state: OpsState) => {
  db.exec(
    `DELETE FROM events; DELETE FROM hub_log; DELETE FROM action_items; DELETE FROM tasks; DELETE FROM meetings; DELETE FROM members;`,
  )
  for (const member of state.members) insertMember.run(member)
  for (const task of state.tasks) {
    insertTask.run({
      ...task,
      completedAt: task.completedAt ?? null,
      fromActionItemId: task.fromActionItemId ?? null,
      workKind: task.workKind ?? 'facility_followup',
      district: task.district ?? 'national',
      facility: task.facility ?? '',
    })
  }
  for (const meeting of state.meetings) {
    insertMeeting.run({
      id: meeting.id,
      title: meeting.title,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      notes: meeting.notes ?? '',
      agenda: meeting.agenda ?? '',
      rolling: meeting.rolling ? 1 : 0,
      participantIds: JSON.stringify(meeting.participantIds),
    })
  }
  for (const item of state.actionItems) {
    insertAction.run({
      ...item,
      convertedToTaskId: item.convertedToTaskId ?? null,
      workKind: item.workKind ?? 'facility_followup',
      district: item.district ?? 'national',
      facility: item.facility ?? '',
    })
  }
  for (const event of state.events) insertEvent.run(event)
  for (const entry of state.hubLog ?? []) {
    insertHubLog.run({
      ...entry,
      detail: entry.detail ?? '',
      facility: entry.facility ?? '',
    })
  }
})

export function getState(now = new Date()): OpsState {
  const members = db.prepare(`SELECT * FROM members ORDER BY id`).all() as TeamMember[]
  const tasks = (db.prepare(`SELECT * FROM tasks`).all() as Record<string, unknown>[]).map(rowTask)
  const meetings = (db.prepare(`SELECT * FROM meetings`).all() as Record<string, unknown>[]).map(
    (row) => rowMeeting(row, now),
  )
  const actionItems = (
    db.prepare(`SELECT * FROM action_items`).all() as Record<string, unknown>[]
  ).map(
    (row): ActionItem => ({
      id: String(row.id),
      meetingId: String(row.meeting_id),
      meetingTitle: String(row.meeting_title),
      title: String(row.title),
      assignedTo: String(row.assigned_to),
      deadline: String(row.deadline),
      status: row.status as ActionItem['status'],
      convertedToTaskId: row.converted_to_task_id ? String(row.converted_to_task_id) : undefined,
      workKind: (row.work_kind as ActionItem['workKind']) || 'facility_followup',
      district: (row.district as ActionItem['district']) || 'national',
      facility: String(row.facility ?? '') || undefined,
    }),
  )
  const events = (db.prepare(`SELECT * FROM events ORDER BY at DESC LIMIT 12`).all() as ActivityEvent[]).map(
    (row) => ({
      id: row.id,
      at: row.at,
      message: row.message,
      tone: row.tone,
    }),
  )
  const hubLog = (db.prepare(`SELECT * FROM hub_log ORDER BY at DESC LIMIT 40`).all() as Record<string, unknown>[]).map(
    (row): HubLogEntry => ({
      id: String(row.id),
      at: String(row.at),
      kind: row.kind as HubLogEntry['kind'],
      title: String(row.title),
      detail: String(row.detail ?? ''),
      district: (row.district as HubLogEntry['district']) || 'national',
      facility: String(row.facility ?? '') || undefined,
      authorId: String(row.author_id),
    }),
  )
  return { members, tasks, meetings, actionItems, events, hubLog }
}

export function resetState(): OpsState {
  replaceAll(buildSeed())
  return getState()
}

export function addTask(task: Task): OpsState {
  insertTask.run({
    ...task,
    completedAt: task.completedAt ?? null,
    fromActionItemId: task.fromActionItemId ?? null,
    workKind: task.workKind ?? 'facility_followup',
    district: task.district ?? 'national',
    facility: task.facility ?? '',
  })
  logEvent(
    `New task assigned · ${task.title}`,
    task.priority === 'critical' ? 'danger' : 'info',
  )
  return getState()
}

export function updateTask(id: string, patch: Partial<Task>): OpsState {
  const raw = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as Record<string, unknown> | undefined
  if (!raw) throw new HttpError(404, 'Task not found')
  const current = rowTask(raw)
  const next: Task = { ...current, ...patch }
  if (patch.status === 'completed') {
    next.progress = 100
    next.completedAt = next.completedAt ?? nowIso()
  }
  db.prepare(
    `UPDATE tasks SET
      title = @title,
      description = @description,
      assigned_to = @assignedTo,
      assigned_by = @assignedBy,
      priority = @priority,
      due_date = @dueDate,
      status = @status,
      progress = @progress,
      completed_at = @completedAt,
      work_kind = @workKind,
      district = @district,
      facility = @facility
     WHERE id = @id`,
  ).run({
    ...next,
    completedAt: next.completedAt ?? null,
    workKind: next.workKind ?? 'facility_followup',
    district: next.district ?? 'national',
    facility: next.facility ?? '',
  })
  const members = getState().members
  if (current.status !== next.status && next.status === 'completed') {
    logEvent(`${memberName(members, next.assignedTo)} completed · ${next.title}`, 'success')
  } else if (current.status !== next.status) {
    logEvent(`Status change · ${next.title}`, next.status === 'overdue' ? 'danger' : 'info')
  } else if (current.assignedTo !== next.assignedTo) {
    logEvent(`Reassigned · ${next.title}`, 'info')
  }
  return getState()
}

export function addMeeting(meeting: Meeting): OpsState {
  insertMeeting.run({
    id: meeting.id,
    title: meeting.title,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    notes: meeting.notes ?? '',
    agenda: meeting.agenda ?? '',
    rolling: meeting.rolling ? 1 : 0,
    participantIds: JSON.stringify(meeting.participantIds),
  })
  logEvent(`Meeting added · ${meeting.title}`, 'info')
  return getState()
}

export function updateMeeting(id: string, patch: Partial<Meeting>): OpsState {
  const raw = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id) as Record<string, unknown> | undefined
  if (!raw) throw new HttpError(404, 'Meeting not found')
  const current = rowMeeting(raw, new Date())
  const next: Meeting = { ...current, ...patch }
  db.prepare(
    `UPDATE meetings SET
      title = @title,
      start_time = @startTime,
      end_time = @endTime,
      notes = @notes,
      agenda = @agenda,
      rolling = @rolling,
      participant_ids = @participantIds
     WHERE id = @id`,
  ).run({
    id: next.id,
    title: next.title,
    startTime: next.startTime,
    endTime: next.endTime,
    notes: next.notes ?? '',
    agenda: next.agenda ?? '',
    rolling: next.rolling ? 1 : 0,
    participantIds: JSON.stringify(next.participantIds),
  })
  if (patch.startTime && patch.startTime !== current.startTime) {
    logEvent(`Meeting started · ${next.title}`, 'info')
  } else if (patch.endTime && patch.endTime !== current.endTime) {
    logEvent(`Meeting ended · ${next.title}`, 'success')
  } else if (patch.notes !== undefined && patch.notes !== current.notes) {
    logEvent(`Minutes updated · ${next.title}`, 'info')
  } else if (patch.agenda !== undefined && patch.agenda !== current.agenda) {
    logEvent(`Agenda updated · ${next.title}`, 'info')
  }
  return getState()
}

export function addActionItem(item: ActionItem): OpsState {
  insertAction.run({
    ...item,
    convertedToTaskId: item.convertedToTaskId ?? null,
    workKind: item.workKind ?? 'facility_followup',
    district: item.district ?? 'national',
    facility: item.facility ?? '',
  })
  logEvent(`Action item created · ${item.title}`, 'info')
  return getState()
}

export function updateActionItem(id: string, patch: Partial<ActionItem>): OpsState {
  const row = db.prepare(`SELECT * FROM action_items WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined
  if (!row) throw new HttpError(404, 'Action item not found')
  const next = {
    id,
    meetingId: String(row.meeting_id),
    meetingTitle: String(row.meeting_title),
    title: String(row.title),
    assignedTo: String(row.assigned_to),
    deadline: String(row.deadline),
    status: String(row.status),
    convertedToTaskId: row.converted_to_task_id ? String(row.converted_to_task_id) : undefined,
    workKind: (row.work_kind as ActionItem['workKind']) || 'facility_followup',
    district: (row.district as ActionItem['district']) || 'national',
    facility: String(row.facility ?? '') || undefined,
    ...patch,
  }
  db.prepare(
    `UPDATE action_items SET
      meeting_id = @meetingId,
      meeting_title = @meetingTitle,
      title = @title,
      assigned_to = @assignedTo,
      deadline = @deadline,
      status = @status,
      converted_to_task_id = @convertedToTaskId,
      work_kind = @workKind,
      district = @district,
      facility = @facility
     WHERE id = @id`,
  ).run({
    ...next,
    convertedToTaskId: next.convertedToTaskId ?? null,
    facility: next.facility ?? '',
  })
  return getState()
}

export function convertAction(actionId: string, assignedBy: string): OpsState {
  const run = db.transaction(() => {
    const row = db.prepare(`SELECT * FROM action_items WHERE id = ?`).get(actionId) as
      | Record<string, unknown>
      | undefined
    if (!row) throw new HttpError(404, 'Action item not found')
    if (row.converted_to_task_id) throw new HttpError(409, 'Action item already converted')
    const task: Task = {
      id: uid('t'),
      title: String(row.title),
      description: `Converted from meeting action · ${String(row.meeting_title)}`,
      assignedTo: String(row.assigned_to),
      assignedBy,
      priority: 'high',
      dueDate: String(row.deadline),
      status: 'not_started',
      progress: 0,
      createdAt: nowIso(),
      fromActionItemId: actionId,
      workKind: (row.work_kind as Task['workKind']) || 'facility_followup',
      district: (row.district as Task['district']) || 'national',
      facility: String(row.facility ?? '') || undefined,
    }
    insertTask.run({
      ...task,
      completedAt: null,
      fromActionItemId: actionId,
      facility: task.facility ?? '',
    })
    db.prepare(
      `UPDATE action_items SET converted_to_task_id = ?, status = 'in_progress' WHERE id = ?`,
    ).run(task.id, actionId)
    logEvent(`Action converted to task · ${task.title}`, 'success')
    return getState()
  })
  return run()
}

export function addHubLog(entry: HubLogEntry): OpsState {
  insertHubLog.run({
    ...entry,
    detail: entry.detail ?? '',
    facility: entry.facility ?? '',
  })
  const prefix =
    entry.kind === 'extract_failed'
      ? 'Extract failed'
      : entry.kind === 'extract_restored'
        ? 'Extract restored'
        : entry.kind === 'late_reporting'
          ? 'Late reporting'
          : entry.kind === 'incident'
            ? 'Incident'
            : 'Hub note'
  logEvent(
    `${prefix} · ${entry.title}`,
    entry.kind === 'extract_failed' || entry.kind === 'incident' ? 'danger' : 'info',
  )
  return getState()
}

export function tickOverdue(now = new Date()): OpsState | null {
  const tasks = (db.prepare(`SELECT * FROM tasks`).all() as Record<string, unknown>[]).map(rowTask)
  const due = tasks.filter((task) => {
    const derived = displayStatus(task, now)
    return task.status !== 'completed' && derived === 'overdue' && task.status !== 'overdue'
  })
  if (due.length === 0) return null
  const mark = db.prepare(`UPDATE tasks SET status = 'overdue' WHERE id = ?`)
  const run = db.transaction(() => {
    for (const task of due) mark.run(task.id)
    logEvent(
      `${due.length} overdue ${due.length === 1 ? 'task requires' : 'tasks require'} attention`,
      'danger',
    )
  })
  run()
  return getState()
}

export function tickProgress(): OpsState | null {
  const active = (
    db
      .prepare(`SELECT * FROM tasks WHERE status IN ('in_progress', 'under_review')`)
      .all() as Record<string, unknown>[]
  ).map(rowTask)
  if (active.length === 0) return null
  const task = active[Math.floor(Math.random() * active.length)]
  const bump = 1 + Math.floor(Math.random() * 3)
  const progress = Math.min(task.status === 'under_review' ? 99 : 96, task.progress + bump)
  if (progress === task.progress) return null
  db.prepare(`UPDATE tasks SET progress = ? WHERE id = ?`).run(progress, task.id)
  return getState()
}

db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
const SEED_VERSION = 'meet-agenda-1'
const seedRow = db.prepare(`SELECT value FROM meta WHERE key = 'seed'`).get() as { value: string } | undefined
if (!seedRow || seedRow.value !== SEED_VERSION) {
  replaceAll(buildSeed())
  db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('seed', ?)`).run(SEED_VERSION)
}
