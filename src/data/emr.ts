/**
 * EMR go-live instant. Change these values to move the countdown.
 * Month is 1–12. Hour and minute are local time.
 */
export const EMR_GO_LIVE_YEAR = 2026
export const EMR_GO_LIVE_MONTH = 12
export const EMR_GO_LIVE_DAY = 26
export const EMR_GO_LIVE_HOUR = 0
export const EMR_GO_LIVE_MINUTE = 0

export const EMR_GO_LIVE = new Date(
  EMR_GO_LIVE_YEAR,
  EMR_GO_LIVE_MONTH - 1,
  EMR_GO_LIVE_DAY,
  EMR_GO_LIVE_HOUR,
  EMR_GO_LIVE_MINUTE,
  0,
  0,
)

export interface EmrRemaining {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function emrRemaining(target: Date, now: Date): EmrRemaining {
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  return { days, hours, minutes, seconds }
}

export function formatEmrGoLiveDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Stored on tasks entered from the operator desk so they stay on the EMR Launch page. */
export const EMR_WORK_LABEL = 'EMR Launch'

export const EMR_PHASES = [
  { id: 'align', number: 1, label: 'Align' },
  { id: 'prepare', number: 2, label: 'Prepare task' },
  { id: 'build', number: 3, label: 'Build & test' },
  { id: 'integrate', number: 4, label: 'Integrate' },
  { id: 'train', number: 5, label: 'Train & onboard' },
  { id: 'launch', number: 6, label: 'Launch' },
] as const

export type EmrPhaseId = (typeof EMR_PHASES)[number]['id']

const PHASE_IDS = new Set<string>(EMR_PHASES.map((phase) => phase.id))

export function isEmrPhase(value: string | undefined | null): value is EmrPhaseId {
  return Boolean(value && PHASE_IDS.has(value))
}

const PHASE_CUES: { id: EmrPhaseId; pattern: RegExp; weight: number }[] = [
  { id: 'prepare', pattern: /prepare\s+task/, weight: 4 },
  { id: 'build', pattern: /build\s*(&|and)\s*test/, weight: 4 },
  { id: 'train', pattern: /train\s*(&|and)\s*on-?board/, weight: 4 },
  { id: 'launch', pattern: /\blaunch\b|go-?live/, weight: 3 },
  { id: 'train', pattern: /\btrain\b|on-?board/, weight: 2 },
  { id: 'integrate', pattern: /integrat/, weight: 2 },
  { id: 'build', pattern: /\bbuild\b|\btest\b/, weight: 2 },
  { id: 'prepare', pattern: /\bprepar/, weight: 2 },
  { id: 'align', pattern: /\balign\b|advocac|stakeholder/, weight: 2 },
]

/** Stage a task sits under. Wording that names a stage wins; otherwise the stage chosen on the desk. */
export function emrPhaseOf(task: {
  title: string
  description?: string
  emrPhase?: string
}): EmrPhaseId {
  const text = `${task.title}\n${task.description ?? ''}`.toLowerCase()
  let best: { id: EmrPhaseId; weight: number } | null = null
  for (const cue of PHASE_CUES) {
    if (!cue.pattern.test(text)) continue
    if (!best || cue.weight > best.weight) best = { id: cue.id, weight: cue.weight }
  }
  if (best) return best.id
  if (isEmrPhase(task.emrPhase)) return task.emrPhase
  return 'align'
}

const EMR_TASK = /\bemr\b|electronic medical record/i

/** Tasks that belong on the EMR view, not the main hub board. */
export function isEmrTask(task: {
  title: string
  description?: string
  workKindOther?: string
}): boolean {
  return EMR_TASK.test(`${task.title}\n${task.description ?? ''}\n${task.workKindOther ?? ''}`)
}
