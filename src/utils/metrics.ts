import { districtLabel } from '../data/catalog'
import type {
  ActionItem,
  DistrictId,
  HubLogEntry,
  Meeting,
  MeetingStatus,
  OpsState,
  TeamActivity,
  PeriodId,
  Priority,
  Task,
  TaskStatus,
  TeamMember,
  WorkloadLevel,
} from '../types'
import {
  addDays,
  endOfDay,
  endOfWeek,
  isInRange,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from './time'

export const PERIODS: PeriodId[] = ['Daily', 'Weekly', 'Monthly', 'Yearly']

export const PERIOD_COPY: Record<PeriodId, string> = {
  Daily: 'Completed vs due · today by hour',
  Weekly: 'Completed vs due · last 7 days',
  Monthly: 'Completed vs due · this month',
  Yearly: 'Completed vs due · this year',
}

export const PERIOD_CLOSED_LABEL: Record<PeriodId, string> = {
  Daily: 'Tasks closed today',
  Weekly: 'Tasks closed this week',
  Monthly: 'Tasks closed this month',
  Yearly: 'Tasks closed this year',
}

export const WORKLOAD_LABEL: Record<WorkloadLevel, string> = {
  light: 'Light',
  balanced: 'Balanced',
  heavy: 'Heavy',
  overloaded: 'Overloaded',
}

export function memberById(members: TeamMember[], id: string): TeamMember | undefined {
  return members.find((m) => m.id === id)
}

export function memberName(members: TeamMember[], id: string): string {
  return memberById(members, id)?.name ?? 'Unassigned'
}

export function memberLabel(member: TeamMember): string {
  return `${member.name} (${member.role})`
}

export function memberIndex(members: TeamMember[], id: string): number {
  const idx = members.findIndex((m) => m.id === id)
  return idx < 0 ? 0 : idx
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Pending',
  in_progress: 'In progress',
  under_review: 'Under review',
  completed: 'Completed',
  overdue: 'Overdue',
}

export function taskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABEL[status] ?? status.replaceAll('_', ' ')
}

export function displayStatus(task: Task, now = new Date()): TaskStatus {
  if (task.status === 'completed') return 'completed'
  if (new Date(task.dueDate).getTime() < now.getTime()) return 'overdue'
  return task.status === 'overdue' ? 'in_progress' : task.status
}

export function meetingStatus(
  meeting: { startTime: string; endTime: string },
  now = new Date(),
): MeetingStatus {
  const start = new Date(meeting.startTime).getTime()
  const end = new Date(meeting.endTime).getTime()
  const t = now.getTime()
  if (t < start) return 'upcoming'
  if (t <= end) return 'live'
  return 'completed'
}

export function agendaLines(agenda?: string): string[] {
  return (agenda ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
}

export function todaysMeetings(meetings: Meeting[], now = new Date()): Meeting[] {
  return meetings
    .filter((m) => isSameDay(new Date(m.startTime), now))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
}

export function weeksMeetings(meetings: Meeting[], now = new Date()): Meeting[] {
  const start = startOfWeek(now)
  const end = endOfWeek(now)
  return meetings
    .filter((meeting) => isInRange(meeting.startTime, start, end))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
}

export function openWeekMeetings(meetings: Meeting[], now = new Date()): Meeting[] {
  return weeksMeetings(meetings, now).filter((meeting) => meetingStatus(meeting, now) !== 'completed')
}

export function todaysActivities(activities: TeamActivity[] | undefined, now = new Date()): TeamActivity[] {
  return [...(activities ?? [])]
    .filter((item) => isSameDay(new Date(item.startTime), now))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
}

export function openTodayActivities(activities: TeamActivity[] | undefined, now = new Date()): TeamActivity[] {
  return todaysActivities(activities, now).filter((item) => meetingStatus(item, now) !== 'completed')
}

export function weeksActivities(activities: TeamActivity[] | undefined, now = new Date()): TeamActivity[] {
  const start = startOfWeek(now)
  const end = endOfWeek(now)
  return [...(activities ?? [])]
    .filter((item) => isInRange(item.startTime, start, end))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
}

export function currentOrNextMeeting(
  meetings: Meeting[],
  now = new Date(),
): Meeting | undefined {
  const open = openWeekMeetings(meetings, now)
  return (
    open.find((m) => meetingStatus(m, now) === 'live') ??
    open.find((m) => meetingStatus(m, now) === 'upcoming')
  )
}

export function startingSoon(
  meetings: Meeting[],
  activities: TeamActivity[] | undefined,
  now = new Date(),
  minutes = 30,
): { id: string; kind: 'meeting' | 'activity'; title: string; startTime: string }[] {
  const t = now.getTime()
  const until = t + minutes * 60_000
  const pick = (
    items: { id: string; title: string; startTime: string }[],
    kind: 'meeting' | 'activity',
  ) =>
    items
      .filter((item) => {
        const start = new Date(item.startTime).getTime()
        return start > t && start <= until
      })
      .map((item) => ({ id: item.id, kind, title: item.title, startTime: item.startTime }))
  return [...pick(meetings, 'meeting'), ...pick(activities ?? [], 'activity')].sort(
    (a, b) => +new Date(a.startTime) - +new Date(b.startTime),
  )
}

export function isDueToday(task: Task, now = new Date()): boolean {
  return isSameDay(new Date(task.dueDate), now)
}

export function wasCompletedToday(task: Task, now = new Date()): boolean {
  return Boolean(task.completedAt && isSameDay(new Date(task.completedAt), now))
}

export function completedThisWeek(task: Task, now = new Date()): boolean {
  if (!task.completedAt) return false
  return new Date(task.completedAt).getTime() >= addDays(startOfDay(now), -6).getTime()
}

export function completedOnTime(task: Task): boolean {
  if (task.status !== 'completed' || !task.completedAt) return false
  return new Date(task.completedAt).getTime() <= new Date(task.dueDate).getTime()
}

export function workloadLevel(active: number, overdue: number): WorkloadLevel {
  const score = active + overdue * 1.5
  if (score >= 6) return 'overloaded'
  if (score >= 4) return 'heavy'
  if (score >= 2) return 'balanced'
  return 'light'
}

export interface TeamMetrics {
  meetingsToday: number
  meetingsThisWeek: number
  activitiesToday: number
  dueToday: number
  completedToday: number
  inProgress: number
  overdue: number
  completionRate: number
  completedWeek: number
  onTime: number
  total: number
  liveMeetings: number
  liveActivities: number
  highPriorityDue: number
}

export function teamMetrics(state: OpsState, now = new Date()): TeamMetrics {
  const tasks = state.tasks
  const total = tasks.length
  const completed = tasks.filter((t) => displayStatus(t, now) === 'completed')
  const today = openWeekMeetings(state.meetings, now)
  const activities = openTodayActivities(state.activities, now)
  return {
    meetingsToday: todaysMeetings(state.meetings, now).filter((m) => meetingStatus(m, now) !== 'completed').length,
    meetingsThisWeek: today.length,
    activitiesToday: activities.length,
    dueToday: tasks.filter((t) => isDueToday(t, now) && displayStatus(t, now) !== 'completed').length,
    completedToday: tasks.filter((t) => wasCompletedToday(t, now)).length,
    inProgress: tasks.filter((t) => {
      const s = displayStatus(t, now)
      return s === 'in_progress' || s === 'under_review'
    }).length,
    overdue: tasks.filter((t) => displayStatus(t, now) === 'overdue').length,
    completionRate: total === 0 ? 0 : Math.round((completed.length / total) * 100),
    completedWeek: tasks.filter((t) => completedThisWeek(t, now)).length,
    onTime: tasks.filter((t) => completedOnTime(t)).length,
    total,
    liveMeetings: today.filter((m) => meetingStatus(m, now) === 'live').length,
    liveActivities: activities.filter((item) => meetingStatus(item, now) === 'live').length,
    highPriorityDue: tasks.filter((t) => {
      const s = displayStatus(t, now)
      return isDueToday(t, now) && s !== 'completed' && (t.priority === 'high' || t.priority === 'critical')
    }).length,
  }
}

export interface MemberWorkload {
  member: TeamMember
  active: number
  completed: number
  overdue: number
  assigned: number
  level: WorkloadLevel
}

export function memberWorkloads(state: OpsState, now = new Date()): MemberWorkload[] {
  return state.members.map((member) => {
    const assigned = state.tasks.filter((t) => t.assignedTo === member.id)
    const overdue = assigned.filter((t) => displayStatus(t, now) === 'overdue').length
    const completed = assigned.filter((t) => displayStatus(t, now) === 'completed').length
    const active = assigned.filter((t) => {
      const s = displayStatus(t, now)
      return s !== 'completed'
    }).length
    return {
      member,
      active,
      completed,
      overdue,
      assigned: assigned.length,
      level: workloadLevel(active, overdue),
    }
  })
}

export function priorityTasks(tasks: Task[], now = new Date(), limit = 6): Task[] {
  const rank: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const statusRank: Record<TaskStatus, number> = {
    overdue: 0,
    in_progress: 1,
    under_review: 2,
    not_started: 3,
    completed: 4,
  }
  return [...tasks]
    .filter((t) => displayStatus(t, now) !== 'completed')
    .sort((a, b) => {
      const sa = displayStatus(a, now)
      const sb = displayStatus(b, now)
      if (statusRank[sa] !== statusRank[sb]) return statusRank[sa] - statusRank[sb]
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority]
      return +new Date(a.dueDate) - +new Date(b.dueDate)
    })
    .slice(0, limit)
}

export function dueTodayTasks(tasks: Task[], now = new Date()): Task[] {
  return dueOnDayTasks(tasks, now, now)
}

export function dueOnDayTasks(tasks: Task[], day: Date, now = new Date()): Task[] {
  return tasks
    .filter((t) => isSameDay(new Date(t.dueDate), day) && displayStatus(t, now) !== 'completed')
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))
}

export function overdueTasks(tasks: Task[], now = new Date()): Task[] {
  return tasks
    .filter((t) => displayStatus(t, now) === 'overdue')
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))
}

export function weeklyCompletions(tasks: Task[], now = new Date()): { label: string; count: number }[] {
  return periodSeries('Weekly', tasks, now).map((d) => ({ label: d.label, count: d.completed }))
}

export function periodBounds(period: PeriodId, now = new Date()): { start: Date; end: Date } {
  const end = now
  if (period === 'Daily') return { start: startOfDay(now), end }
  if (period === 'Weekly') return { start: addDays(startOfDay(now), -6), end }
  if (period === 'Monthly') return { start: startOfMonth(now), end }
  return { start: startOfYear(now), end }
}

export function countInBucket(iso: string, start: Date, end: Date): boolean {
  return isInRange(iso, start, end)
}

export function periodSeries(
  period: PeriodId,
  tasks: Task[],
  now = new Date(),
): { label: string; completed: number; due: number }[] {
  const tally = (start: Date, end: Date) => ({
    completed: tasks.filter((t) => t.completedAt && countInBucket(t.completedAt, start, end)).length,
    due: tasks.filter((t) => countInBucket(t.dueDate, start, end)).length,
  })

  if (period === 'Daily') {
    return [8, 10, 12, 14, 16].map((hour) => {
      const start = new Date(now)
      start.setHours(hour, 0, 0, 0)
      const end = new Date(now)
      end.setHours(hour + 1, 59, 59, 999)
      const label = start.toLocaleTimeString('en-US', { hour: 'numeric' })
      return { label, ...tally(start, end) }
    })
  }

  if (period === 'Weekly') {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(startOfDay(now), i - 6)
      return {
        label: day.toLocaleDateString([], { weekday: 'short' }),
        ...tally(day, endOfDay(day)),
      }
    })
  }

  if (period === 'Monthly') {
    const start = startOfMonth(now)
    const buckets: { label: string; completed: number; due: number }[] = []
    for (let cursor = start; cursor.getTime() <= now.getTime(); cursor = addDays(cursor, 7)) {
      const bucketEnd = endOfDay(addDays(cursor, 6))
      const end = bucketEnd.getTime() > now.getTime() ? now : bucketEnd
      buckets.push({
        label: cursor.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        ...tally(cursor, end),
      })
    }
    return buckets
  }

  const monthCount = now.getMonth() + 1
  return Array.from({ length: monthCount }, (_, month) => {
    const monthStart = new Date(now.getFullYear(), month, 1)
    const monthEnd =
      month === now.getMonth() ? now : new Date(now.getFullYear(), month + 1, 0, 23, 59, 59, 999)
    return {
      label: monthStart.toLocaleDateString([], { month: 'short' }),
      ...tally(monthStart, monthEnd),
    }
  })
}

export function periodClosedCount(tasks: Task[], period: PeriodId, now = new Date()): number {
  const { start, end } = periodBounds(period, now)
  return tasks.filter((t) => t.completedAt && isInRange(t.completedAt, start, end)).length
}

export function periodCompletionRate(tasks: Task[], period: PeriodId, now = new Date()): number {
  const { start, end } = periodBounds(period, now)
  const closed = tasks.filter((t) => t.completedAt && isInRange(t.completedAt, start, end)).length
  const due = tasks.filter((t) => isInRange(t.dueDate, start, end)).length
  const denom = Math.max(closed, due, 1)
  return Math.round((closed / denom) * 100)
}

export function statusBreakdown(tasks: Task[], now = new Date()) {
  const counts = { completed: 0, in_progress: 0, not_started: 0, overdue: 0 }
  for (const task of tasks) {
    const status = displayStatus(task, now)
    if (status === 'under_review' || status === 'in_progress') counts.in_progress += 1
    else if (status === 'completed') counts.completed += 1
    else if (status === 'overdue') counts.overdue += 1
    else counts.not_started += 1
  }
  return counts
}

/** Status mix for tasks due or completed within the selected period. */
export function periodStatusBreakdown(tasks: Task[], period: PeriodId, now = new Date()) {
  const { start, end } = periodBounds(period, now)
  const scoped = tasks.filter(
    (t) => isInRange(t.dueDate, start, end) || Boolean(t.completedAt && isInRange(t.completedAt, start, end)),
  )
  return statusBreakdown(scoped, now)
}

export function hubLogStatus(entry: HubLogEntry): 'open' | 'completed' | 'overdue' {
  if (entry.status) return entry.status
  if (entry.kind === 'extract_restored') return 'completed'
  if (entry.kind === 'extract_failed' || entry.kind === 'late_reporting') return 'overdue'
  return 'open'
}

export function defaultHubLogStatus(kind: HubLogEntry['kind']): 'open' | 'completed' | 'overdue' {
  if (kind === 'extract_restored') return 'completed'
  if (kind === 'extract_failed' || kind === 'late_reporting') return 'overdue'
  return 'open'
}

export function priorityBand(priority: Priority): 'high' | 'medium' | 'low' {
  if (priority === 'critical' || priority === 'high') return 'high'
  if (priority === 'medium') return 'medium'
  return 'low'
}

export function loadBand(level: WorkloadLevel): 'high' | 'medium' | 'low' {
  if (level === 'overloaded' || level === 'heavy') return 'high'
  if (level === 'balanced') return 'medium'
  return 'low'
}

export function openActionItems(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => +new Date(a.deadline) - +new Date(b.deadline))
}

export interface DistrictLoad {
  id: DistrictId
  label: string
  open: number
  overdue: number
}

export function districtWorkload(tasks: Task[], now = new Date()): DistrictLoad[] {
  const map = new Map<DistrictId, DistrictLoad>()
  for (const task of tasks) {
    if (displayStatus(task, now) === 'completed') continue
    const current = map.get(task.district) ?? {
      id: task.district,
      label: districtLabel(task.district),
      open: 0,
      overdue: 0,
    }
    current.open += 1
    if (displayStatus(task, now) === 'overdue') current.overdue += 1
    map.set(task.district, current)
  }
  return [...map.values()].sort(
    (a, b) =>
      b.overdue - a.overdue ||
      Number(a.id === 'national') - Number(b.id === 'national') ||
      b.open - a.open,
  )
}

export function todaysHubLog(log: HubLogEntry[], now = new Date()): HubLogEntry[] {
  return log
    .filter((entry) => isSameDay(new Date(entry.at), now))
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
}

export function pipeStatus(log: HubLogEntry[], now = new Date()): HubLogEntry | null {
  const today = todaysHubLog(log, now)
  const failed = today.find((entry) => entry.kind === 'extract_failed')
  const restored = today.find((entry) => entry.kind === 'extract_restored')
  if (failed && (!restored || +new Date(failed.at) > +new Date(restored.at))) return failed
  const late = today.find((entry) => entry.kind === 'late_reporting')
  if (late) return late
  const incident = today.find((entry) => entry.kind === 'incident')
  if (incident) return incident
  return today[0] ?? null
}

export function hotspotDistrict(tasks: Task[], now = new Date()): DistrictLoad | undefined {
  return districtWorkload(tasks, now).find((row) => row.overdue > 0)
}

export function statusMessage(state: OpsState, now = new Date()): string {
  const metrics = teamMetrics(state, now)
  const live = todaysMeetings(state.meetings, now).find((m) => meetingStatus(m, now) === 'live')
  if (live) return `Live now · ${live.title}`
  const hotspot = hotspotDistrict(state.tasks, now)
  if (hotspot) return `${hotspot.label} still open`
  if (metrics.overdue > 0) {
    return `${metrics.overdue} overdue ${metrics.overdue === 1 ? 'task requires' : 'tasks require'} attention`
  }
  const next = currentOrNextMeeting(state.meetings, now)
  if (next && meetingStatus(next, now) === 'upcoming') {
    return `Next up · ${next.title}`
  }
  if (metrics.completionRate >= 70) return 'Operations running on schedule'
  return "Team is executing today's priorities"
}
