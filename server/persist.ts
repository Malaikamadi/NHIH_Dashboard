import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { OpsState } from '../src/types'

export const SEED_VERSION = 'meet-agenda-1'

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

export function storageKind(): 'kv' | 'file' {
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

export async function readSnapshot(): Promise<Snapshot | null> {
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
  const kv = kvConfig()
  if (kv) {
    await redis(['SET', KEY, JSON.stringify(snapshot)])
    return
  }
  mkdirSync(path.dirname(LOCAL_FILE), { recursive: true })
  writeFileSync(LOCAL_FILE, JSON.stringify(snapshot), 'utf8')
}
