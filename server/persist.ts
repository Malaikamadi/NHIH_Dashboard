import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { get, put } from '@vercel/blob'
import type { OpsState } from '../src/types'

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

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}

export function storageKind(): 'blob' | 'kv' | 'file' {
  if (blobEnabled()) return 'blob'
  return kvConfig() ? 'kv' : 'file'
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

async function readBlob(): Promise<Snapshot | null> {
  try {
    const result = await get(BLOB_PATH, { access: 'private', useCache: false })
    if (!result || result.statusCode !== 200 || !result.stream) return null
    const text = await new Response(result.stream).text()
    if (!text) return null
    return JSON.parse(text) as Snapshot
  } catch {
    return null
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

export async function readSnapshot(): Promise<Snapshot | null> {
  if (blobEnabled()) return readBlob()
  const kv = kvConfig()
  if (kv) {
    const result = await redis(['GET', KEY])
    if (!result) return null
    return typeof result === 'string' ? (JSON.parse(result) as Snapshot) : (result as Snapshot)
  }
  if (!existsSync(LOCAL_FILE)) return null
  try {
    return JSON.parse(readFileSync(LOCAL_FILE, 'utf8')) as Snapshot
  } catch {
    return null
  }
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  if (blobEnabled()) {
    await writeBlob(snapshot)
    return
  }
  const kv = kvConfig()
  if (kv) {
    await redis(['SET', KEY, JSON.stringify(snapshot)])
    return
  }
  mkdirSync(path.dirname(LOCAL_FILE), { recursive: true })
  writeFileSync(LOCAL_FILE, JSON.stringify(snapshot), 'utf8')
}
