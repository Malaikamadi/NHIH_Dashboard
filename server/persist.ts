import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { get, put } from '@vercel/blob'
import type { OpsState } from '../src/types'
import { hubHasWork } from '../src/utils/hub'

export const SEED_VERSION = 'live-empty-1'
export const BLOB_PATH = 'ops-state.json'

export interface Snapshot {
  version: string
  state: OpsState
}

const KEY = 'nhih-ops-state'
const LOCAL_FILE = process.env.VERCEL
  ? path.join('/tmp', 'ops-state.json')
  : path.join(process.cwd(), 'data', 'ops-state.json')

export type SnapshotRead =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; missing: true }
  | { ok: false; missing: false; error: string }

let blobBroken = false

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}

function blobEnabled(): boolean {
  return blobConfigured() && !blobBroken
}

export function storageKind(): 'blob' | 'kv' | 'file' {
  if (blobEnabled()) return 'blob'
  if (kvConfig()) return 'kv'
  return 'file'
}

export function storageStatus(): {
  kind: 'blob' | 'kv' | 'file'
  blobConfigured: boolean
  blobBroken: boolean
  kvConfigured: boolean
} {
  return {
    kind: storageKind(),
    blobConfigured: blobConfigured(),
    blobBroken,
    kvConfigured: Boolean(kvConfig()),
  }
}

function markBlobBroken(reason: string): void {
  if (!blobBroken) {
    blobBroken = true
    console.error(`[persist] Vercel Blob unavailable, falling back to ${kvConfig() ? 'kv' : 'file'}: ${reason}`)
  }
}

async function redis(command: unknown[]): Promise<unknown> {
  const kv = kvConfig()
  if (!kv) throw new Error('KV is not configured')
  const res = await fetch(kv.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kv.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`KV command failed (${res.status})`)
  }
  const body = (await res.json()) as { result?: unknown }
  return body.result ?? null
}

function parseSnapshot(text: string): Snapshot {
  const parsed = JSON.parse(text) as Snapshot
  if (!parsed || typeof parsed !== 'object' || !parsed.state) {
    throw new Error('Invalid hub snapshot')
  }
  return {
    version: typeof parsed.version === 'string' ? parsed.version : SEED_VERSION,
    state: parsed.state,
  }
}

async function readBlob(): Promise<SnapshotRead> {
  try {
    const result = await get(BLOB_PATH, { access: 'private', useCache: false })
    if (!result) return { ok: false, missing: true }
    if (result.statusCode === 304) {
      return { ok: false, missing: false, error: 'blob not modified and no local copy' }
    }
    if (result.statusCode === 200 && result.stream) {
      const text = await new Response(result.stream).text()
      if (!text) return { ok: false, missing: true }
      return { ok: true, snapshot: parseSnapshot(text) }
    }
    return { ok: false, missing: false, error: `blob status ${String(result.statusCode)}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/not found|404/i.test(message)) return { ok: false, missing: true }
    return { ok: false, missing: false, error: message }
  }
}

async function writeBlob(snapshot: Snapshot): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(snapshot), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  })
}

async function readKv(): Promise<SnapshotRead> {
  try {
    const result = await redis(['GET', KEY])
    if (!result) return { ok: false, missing: true }
    const snapshot =
      typeof result === 'string' ? parseSnapshot(result) : (result as Snapshot)
    if (!snapshot?.state) return { ok: false, missing: true }
    return { ok: true, snapshot }
  } catch (error) {
    return {
      ok: false,
      missing: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function readFileStore(): SnapshotRead {
  if (!existsSync(LOCAL_FILE)) return { ok: false, missing: true }
  try {
    return { ok: true, snapshot: parseSnapshot(readFileSync(LOCAL_FILE, 'utf8')) }
  } catch (error) {
    return {
      ok: false,
      missing: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function writeFileStore(snapshot: Snapshot): void {
  mkdirSync(path.dirname(LOCAL_FILE), { recursive: true })
  writeFileSync(LOCAL_FILE, JSON.stringify(snapshot), 'utf8')
}

export async function readSnapshot(): Promise<SnapshotRead> {
  if (blobEnabled()) {
    const blob = await readBlob()
    if (blob.ok) return blob
    if (!blob.missing) {
      markBlobBroken(blob.error)
    }
  }

  if (kvConfig()) {
    const kv = await readKv()
    if (kv.ok || !kv.missing) return kv
  }

  return readFileStore()
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  if (blobEnabled()) {
    try {
      await writeBlob(snapshot)
      if (kvConfig()) {
        try {
          await redis(['SET', KEY, JSON.stringify(snapshot)])
        } catch {
          /* optional mirror */
        }
      }
      writeFileStore(snapshot)
      return
    } catch (error) {
      markBlobBroken(error instanceof Error ? error.message : String(error))
    }
  }

  if (kvConfig()) {
    await redis(['SET', KEY, JSON.stringify(snapshot)])
    writeFileStore(snapshot)
    return
  }

  writeFileStore(snapshot)
}

export function preferExisting(current: Snapshot | null, incoming: Snapshot): Snapshot {
  if (current && hubHasWork(current.state) && !hubHasWork(incoming.state)) return current
  return incoming
}
