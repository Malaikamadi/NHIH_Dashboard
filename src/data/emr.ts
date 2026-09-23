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

const EMR_TASK = /\bemr\b|electronic medical record/i

/** Tasks that belong on the EMR view, not the main hub board. */
export function isEmrTask(task: {
  title: string
  description?: string
  workKindOther?: string
}): boolean {
  return EMR_TASK.test(`${task.title}\n${task.description ?? ''}\n${task.workKindOther ?? ''}`)
}
