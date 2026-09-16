import type {
  ActionItem,
  ActivityEvent,
  HubLogEntry,
  Meeting,
  OpsState,
  Task,
  TeamActivity,
} from '../src/types'
import { displayStatus, memberName } from '../src/utils/metrics'
import { atTime, nowIso, uid } from '../src/utils/time'
import { HttpError } from './errors'

function pushEvent(state: OpsState, message: string, tone: ActivityEvent['tone']): OpsState {
  return {
    ...state,
    events: [{ id: uid('e'), at: nowIso(), message, tone }, ...state.events].slice(0, 12),
  }
}

function rollMeeting(meeting: Meeting, now: Date): Meeting {
  if (!meeting.rolling) return meeting
  const start = new Date(meeting.startTime)
  const end = new Date(meeting.endTime)
  return {
    ...meeting,
    startTime: atTime(now, start.getHours(), start.getMinutes()).toISOString(),
    endTime: atTime(now, end.getHours(), end.getMinutes()).toISOString(),
  }
}

export function viewState(state: OpsState, now = new Date()): OpsState {
  return {
    ...state,
    meetings: state.meetings.map((meeting) => rollMeeting(meeting, now)),
    hubLog: state.hubLog ?? [],
    activities: state.activities ?? [],
  }
}

export function tickOverdue(state: OpsState, now = new Date()): OpsState {
  const due = state.tasks.filter((task) => {
    const derived = displayStatus(task, now)
    return task.status !== 'completed' && derived === 'overdue' && task.status !== 'overdue'
  })
  if (due.length === 0) return state
  const ids = new Set(due.map((task) => task.id))
  return pushEvent(
    {
      ...state,
      tasks: state.tasks.map((task) => (ids.has(task.id) ? { ...task, status: 'overdue' } : task)),
    },
    `${due.length} overdue ${due.length === 1 ? 'task requires' : 'tasks require'} attention`,
    'danger',
  )
}

export function addTask(state: OpsState, task: Task): OpsState {
  return pushEvent(
    { ...state, tasks: [task, ...state.tasks] },
    `New task assigned · ${task.title}`,
    task.priority === 'critical' ? 'danger' : 'info',
  )
}

export function updateTask(state: OpsState, id: string, patch: Partial<Task>): OpsState {
  const current = state.tasks.find((task) => task.id === id)
  if (!current) throw new HttpError(404, 'Task not found')
  const next: Task = { ...current, ...patch }
  if (patch.status === 'completed') {
    next.progress = 100
    next.completedAt = next.completedAt ?? nowIso()
  }
  let following = {
    ...state,
    tasks: state.tasks.map((task) => (task.id === id ? next : task)),
  }
  if (current.status !== next.status && next.status === 'completed') {
    following = pushEvent(
      following,
      `${memberName(state.members, next.assignedTo)} completed · ${next.title}`,
      'success',
    )
  } else if (current.status !== next.status) {
    following = pushEvent(
      following,
      `Status change · ${next.title}`,
      next.status === 'overdue' ? 'danger' : 'info',
    )
  } else if (current.assignedTo !== next.assignedTo) {
    following = pushEvent(following, `Reassigned · ${next.title}`, 'info')
  }
  return following
}

export function addMeeting(state: OpsState, meeting: Meeting): OpsState {
  return pushEvent(
    { ...state, meetings: [...state.meetings, meeting] },
    `Meeting added · ${meeting.title}`,
    'info',
  )
}

export function updateMeeting(state: OpsState, id: string, patch: Partial<Meeting>): OpsState {
  const current = state.meetings.find((meeting) => meeting.id === id)
  if (!current) throw new HttpError(404, 'Meeting not found')
  const next: Meeting = { ...current, ...patch }
  let following = {
    ...state,
    meetings: state.meetings.map((meeting) => (meeting.id === id ? next : meeting)),
  }
  if (patch.startTime && patch.startTime !== current.startTime) {
    following = pushEvent(following, `Meeting started · ${next.title}`, 'info')
  } else if (patch.endTime && patch.endTime !== current.endTime) {
    following = pushEvent(following, `Meeting ended · ${next.title}`, 'success')
  } else if (patch.notes !== undefined && patch.notes !== current.notes) {
    following = pushEvent(following, `Minutes updated · ${next.title}`, 'info')
  } else if (patch.agenda !== undefined && patch.agenda !== current.agenda) {
    following = pushEvent(following, `Agenda updated · ${next.title}`, 'info')
  }
  return following
}

export function addActivity(state: OpsState, activity: TeamActivity): OpsState {
  return pushEvent(
    { ...state, activities: [...(state.activities ?? []), activity] },
    `Activity added · ${activity.title}`,
    'info',
  )
}

export function updateActivity(state: OpsState, id: string, patch: Partial<TeamActivity>): OpsState {
  const current = (state.activities ?? []).find((activity) => activity.id === id)
  if (!current) throw new HttpError(404, 'Activity not found')
  const next: TeamActivity = { ...current, ...patch }
  let following = {
    ...state,
    activities: (state.activities ?? []).map((activity) => (activity.id === id ? next : activity)),
  }
  if (patch.startTime && patch.startTime !== current.startTime) {
    following = pushEvent(following, `Activity started · ${next.title}`, 'info')
  } else if (patch.endTime && patch.endTime !== current.endTime) {
    following = pushEvent(following, `Activity ended · ${next.title}`, 'success')
  }
  return following
}

export function addActionItem(state: OpsState, item: ActionItem): OpsState {
  return pushEvent(
    { ...state, actionItems: [item, ...state.actionItems] },
    `Action item created · ${item.title}`,
    'info',
  )
}

export function updateActionItem(state: OpsState, id: string, patch: Partial<ActionItem>): OpsState {
  const current = state.actionItems.find((item) => item.id === id)
  if (!current) throw new HttpError(404, 'Action item not found')
  const next = { ...current, ...patch }
  return {
    ...state,
    actionItems: state.actionItems.map((item) => (item.id === id ? next : item)),
  }
}

export function convertAction(state: OpsState, actionId: string, assignedBy: string): OpsState {
  const item = state.actionItems.find((entry) => entry.id === actionId)
  if (!item) throw new HttpError(404, 'Action item not found')
  if (item.convertedToTaskId) throw new HttpError(409, 'Action item already converted')
  const task: Task = {
    id: uid('t'),
    title: item.title,
    description: `Converted from meeting action · ${item.meetingTitle}`,
    assignedTo: item.assignedTo,
    assignedBy,
    priority: 'high',
    dueDate: item.deadline,
    status: 'not_started',
    progress: 0,
    createdAt: nowIso(),
    fromActionItemId: actionId,
    workKind: item.workKind,
    workKindOther: item.workKindOther,
    district: item.district,
    facility: item.facility,
  }
  return pushEvent(
    {
      ...state,
      tasks: [task, ...state.tasks],
      actionItems: state.actionItems.map((entry) =>
        entry.id === actionId
          ? { ...entry, convertedToTaskId: task.id, status: 'in_progress' }
          : entry,
      ),
    },
    `Action converted to task · ${task.title}`,
    'success',
  )
}

export function addHubLog(state: OpsState, entry: HubLogEntry): OpsState {
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
  return pushEvent(
    { ...state, hubLog: [entry, ...(state.hubLog ?? [])] },
    `${prefix} · ${entry.title}`,
    entry.kind === 'extract_failed' || entry.kind === 'incident' ? 'danger' : 'info',
  )
}

export function updateHubLog(state: OpsState, id: string, patch: Partial<HubLogEntry>): OpsState {
  const current = (state.hubLog ?? []).find((entry) => entry.id === id)
  if (!current) throw new HttpError(404, 'Hub log entry not found')
  return {
    ...state,
    hubLog: (state.hubLog ?? []).map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
  }
}

export function removeTask(state: OpsState, id: string): OpsState {
  const current = state.tasks.find((task) => task.id === id)
  if (!current) throw new HttpError(404, 'Task not found')
  return pushEvent(
    { ...state, tasks: state.tasks.filter((task) => task.id !== id) },
    `Task deleted · ${current.title}`,
    'info',
  )
}

export function removeMeeting(state: OpsState, id: string): OpsState {
  const current = state.meetings.find((meeting) => meeting.id === id)
  if (!current) throw new HttpError(404, 'Meeting not found')
  return pushEvent(
    { ...state, meetings: state.meetings.filter((meeting) => meeting.id !== id) },
    `Meeting deleted · ${current.title}`,
    'info',
  )
}

export function removeActivity(state: OpsState, id: string): OpsState {
  const current = (state.activities ?? []).find((activity) => activity.id === id)
  if (!current) throw new HttpError(404, 'Activity not found')
  return pushEvent(
    { ...state, activities: (state.activities ?? []).filter((activity) => activity.id !== id) },
    `Activity deleted · ${current.title}`,
    'info',
  )
}

export function removeActionItem(state: OpsState, id: string): OpsState {
  const current = state.actionItems.find((item) => item.id === id)
  if (!current) throw new HttpError(404, 'Action item not found')
  return pushEvent(
    { ...state, actionItems: state.actionItems.filter((item) => item.id !== id) },
    `Action item deleted · ${current.title}`,
    'info',
  )
}

export function removeHubLog(state: OpsState, id: string): OpsState {
  const current = (state.hubLog ?? []).find((entry) => entry.id === id)
  if (!current) throw new HttpError(404, 'Hub log entry not found')
  return pushEvent(
    { ...state, hubLog: (state.hubLog ?? []).filter((entry) => entry.id !== id) },
    `Hub incident log deleted · ${current.title}`,
    'info',
  )
}
