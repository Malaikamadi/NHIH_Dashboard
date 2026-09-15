import type { OpsState } from '../types'
import { hubHasWork } from '../utils/hub'

const CACHE_KEY = 'nhih-ops-state-cache'

export function readHubCache(): OpsState | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CACHE_KEY) ?? localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OpsState
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeHubCache(state: OpsState): void {
  if (!hubHasWork(state)) return
  const raw = JSON.stringify(state)
  try {
    sessionStorage.setItem(CACHE_KEY, raw)
    localStorage.setItem(CACHE_KEY, raw)
  } catch {
    /* quota or private mode */
  }
}

export function clearHubCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY)
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}
