import { getOperatorCode, setOperatorCode } from './access'
import type { ActionItem, HubLogEntry, Meeting, OpsState, Task } from './types'
import type { WeeklyReport } from './utils/report'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  const code = getOperatorCode()
  if (code) headers['X-Operator-Code'] = code
  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    throw new Error(`${res.status} ${path}`)
  }
  return res.json() as Promise<T>
}

export async function unlockOperator(code: string): Promise<boolean> {
  const res = await fetch('/api/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) return false
  setOperatorCode(code)
  return true
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
  let closed = false
  let source: EventSource | null = new EventSource('/api/stream')

  const apply = (state: OpsState) => {
    if (closed) return
    onState(state)
    onStatus(true)
  }

  source.onopen = () => onStatus(true)
  source.onmessage = (event) => {
    try {
      apply(JSON.parse(event.data) as OpsState)
    } catch {
      /* ignore pings and malformed frames */
    }
  }
  source.onerror = () => {
    source?.close()
    source = null
    onStatus(false)
  }

  const timer = window.setInterval(() => {
    void fetchState()
      .then(apply)
      .catch(() => {
        if (!closed) onStatus(false)
      })
  }, 4000)

  return () => {
    closed = true
    source?.close()
    window.clearInterval(timer)
  }
}
