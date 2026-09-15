import { buildSeed, MEMBERS } from '../src/data/seed'
import type { ActionItem, HubLogEntry, Meeting, OpsState, Task, TeamActivity } from '../src/types'
import * as ops from './ops'
import { readSnapshot, SEED_VERSION, storageKind, writeSnapshot, type Snapshot } from './persist'

const cacheProcess = !process.env.VERCEL
let memory: Snapshot | null = null
let loading: Promise<Snapshot> | null = null

function withRoster(state: OpsState): { state: OpsState; changed: boolean } {
  const current = state.members
  const same =
    current.length === MEMBERS.length &&
    current.every((member, index) => {
      const next = MEMBERS[index]
      return (
        member.id === next.id &&
        member.name === next.name &&
        member.role === next.role &&
        member.initials === next.initials
      )
    })
  if (same) {
    return {
      state: { ...state, hubLog: state.hubLog ?? [], activities: state.activities ?? [] },
      changed: false,
    }
  }
  return {
    state: { ...state, members: MEMBERS, hubLog: state.hubLog ?? [], activities: state.activities ?? [] },
    changed: true,
  }
}

async function loadFromStore(): Promise<Snapshot> {
  const stored = await readSnapshot()
  if (!stored || stored.version !== SEED_VERSION) {
    const next = { version: SEED_VERSION, state: buildSeed() }
    await writeSnapshot(next)
    return next
  }
  const merged = withRoster(stored.state)
  const next = { version: stored.version, state: merged.state }
  if (merged.changed) await writeSnapshot(next)
  return next
}

async function snapshot(): Promise<Snapshot> {
  if (cacheProcess && memory) return memory
  if (!loading) {
    loading = loadFromStore().finally(() => {
      loading = null
    })
  }
  const next = await loading
  memory = next
  return next
}

async function commit(state: OpsState): Promise<OpsState> {
  memory = { version: SEED_VERSION, state }
  await writeSnapshot(memory)
  return ops.viewState(state)
}

export async function getState(): Promise<OpsState> {
  const current = await snapshot()
  const ticked = ops.tickOverdue(current.state)
  if (ticked !== current.state) return commit(ticked)
  return ops.viewState(ticked)
}

export async function resetState(): Promise<OpsState> {
  memory = null
  return commit(buildSeed())
}

export async function addTask(task: Task): Promise<OpsState> {
  const current = await snapshot()
  return commit(ops.addTask(current.state, task))
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<OpsState> {
  const current = await snapshot()
  return commit(ops.updateTask(current.state, id, patch))
}

export async function addMeeting(meeting: Meeting): Promise<OpsState> {
  const current = await snapshot()
  return commit(ops.addMeeting(current.state, meeting))
}

export async function updateMeeting(id: string, patch: Partial<Meeting>): Promise<OpsState> {
  const current = await snapshot()
  return commit(ops.updateMeeting(current.state, id, patch))
}

export async function addActivity(activity: TeamActivity): Promise<OpsState> {
  const current = await snapshot()
  return commit(ops.addActivity(current.state, activity))
}

export async function updateActivity(id: string, patch: Partial<TeamActivity>): Promise<OpsState> {
  const current = await snapshot()
  return commit(ops.updateActivity(current.state, id, patch))
}

export async function addActionItem(item: ActionItem): Promise<OpsState> {
  const current = await snapshot()
  return commit(ops.addActionItem(current.state, item))
}

export async function updateActionItem(id: string, patch: Partial<ActionItem>): Promise<OpsState> {
  const current = await snapshot()
  return commit(ops.updateActionItem(current.state, id, patch))
}

export async function convertAction(actionId: string, assignedBy: string): Promise<OpsState> {
  const current = await snapshot()
  return commit(ops.convertAction(current.state, actionId, assignedBy))
}

export async function addHubLog(entry: HubLogEntry): Promise<OpsState> {
  const current = await snapshot()
  return commit(ops.addHubLog(current.state, entry))
}

export async function updateHubLog(id: string, patch: Partial<HubLogEntry>): Promise<OpsState> {
  const current = await snapshot()
  return commit(ops.updateHubLog(current.state, id, patch))
}

export async function tickOverdue(): Promise<OpsState | null> {
  const current = await snapshot()
  const ticked = ops.tickOverdue(current.state)
  if (ticked === current.state) return null
  return commit(ticked)
}

export function persistence(): 'blob' | 'kv' | 'file' {
  return storageKind()
}
