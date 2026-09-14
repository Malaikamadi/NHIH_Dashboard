import type { ActionItem, HubLogEntry, Meeting, OpsState, Task } from './types'
import type { WeeklyReport } from './utils/report'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`${res.status} ${path}`)
  }
  return res.json() as Promise<T>
}

export function fetchState(): Promise<OpsState> {
  return request<OpsState>('/api/state')
}

export function createTask(task: Task): Promise<OpsState> {
  return request<OpsState>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  })
}

export function patchTask(id: string, patch: Partial<Task>): Promise<OpsState> {
  return request<OpsState>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function createMeeting(meeting: Meeting): Promise<OpsState> {
  return request<OpsState>('/api/meetings', {
    method: 'POST',
    body: JSON.stringify(meeting),
  })
}

export function createActionItem(item: ActionItem): Promise<OpsState> {
  return request<OpsState>('/api/actions', {
    method: 'POST',
    body: JSON.stringify(item),
  })
}

export function convertAction(actionId: string, assignedBy: string): Promise<OpsState> {
  return request<OpsState>(`/api/actions/${actionId}/convert`, {
    method: 'POST',
    body: JSON.stringify({ assignedBy }),
  })
}

export function patchActionItem(id: string, patch: Partial<ActionItem>): Promise<OpsState> {
  return request<OpsState>(`/api/actions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function resetDemo(): Promise<OpsState> {
  return request<OpsState>('/api/reset', { method: 'POST' })
}

export function patchMeeting(id: string, patch: Partial<Meeting>): Promise<OpsState> {
  return request<OpsState>(`/api/meetings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function createHubLog(entry: HubLogEntry): Promise<OpsState> {
  return request<OpsState>('/api/hub-log', {
    method: 'POST',
    body: JSON.stringify(entry),
  })
}

export function fetchWeeklyReport(): Promise<WeeklyReport> {
  return request<WeeklyReport>('/api/reports/weekly')
}

export async function fetchWeeklyReportHtml(): Promise<string> {
  const res = await fetch('/api/reports/weekly?format=html')
  if (!res.ok) throw new Error(`${res.status} /api/reports/weekly`)
  return res.text()
}

export function openStateStream(onState: (state: OpsState) => void, onStatus: (live: boolean) => void): () => void {
  const source = new EventSource('/api/stream')
  source.onopen = () => onStatus(true)
  source.onerror = () => onStatus(false)
  source.onmessage = (event) => {
    onStatus(true)
    try {
      onState(JSON.parse(event.data) as OpsState)
    } catch {
      /* ignore malformed frames */
    }
  }
  return () => source.close()
}
