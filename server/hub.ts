import type { OpsState } from '../src/types'

type Send = (state: OpsState) => void

const clients = new Set<Send>()

export function subscribe(send: Send): () => void {
  clients.add(send)
  return () => {
    clients.delete(send)
  }
}

export function broadcast(state: OpsState): void {
  for (const send of clients) {
    try {
      send(state)
    } catch {
      clients.delete(send)
    }
  }
}

export function clientCount(): number {
  return clients.size
}
