import type { OpsState } from '../src/types'

export const SEED_VERSION = 'live-empty-1'
export const BLOB_PATH = 'ops-state.json'

export interface Snapshot {
  version: string
  state: OpsState
}

export type SnapshotRead =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; missing: true }
  | { ok: false; missing: false; error: string }
