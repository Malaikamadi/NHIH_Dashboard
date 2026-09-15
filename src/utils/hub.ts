import type { OpsState } from '../types'

export function hubHasWork(state: Partial<OpsState> | null | undefined): boolean {
  if (!state) return false
  return Boolean(
    state.tasks?.length ||
      state.meetings?.length ||
      state.activities?.length ||
      state.actionItems?.length ||
      state.hubLog?.length,
  )
}
