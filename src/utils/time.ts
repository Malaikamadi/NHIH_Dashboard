export function nowIso(): string {
  return new Date().toISOString()
}

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function atTime(base: Date, hours: number, minutes: number): Date {
  const d = new Date(base)
  d.setHours(hours, minutes, 0, 0)
  return d
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

export function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const weekday = d.getDay()
  return addDays(d, weekday === 0 ? -6 : 1 - weekday)
}

export function endOfWeek(date: Date): Date {
  return endOfDay(addDays(startOfWeek(date), 6))
}

export function weekDays(date: Date): Date[] {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDateInput(value: string, fallback = new Date()): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return startOfDay(fallback)
  return startOfDay(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

export function startOfMonth(date: Date): Date {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

export function startOfYear(date: Date): Date {
  const d = startOfDay(date)
  d.setMonth(0, 1)
  return d
}

export function isInRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t <= end.getTime()
}

export function formatRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear()
  const from = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
  const to = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${from} – ${to}`
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDue(iso: string, now = new Date()): string {
  const due = new Date(iso)
  if (isSameDay(due, now)) return `Today ${formatTime(iso)}`
  if (isSameDay(due, addDays(now, 1))) return `Tomorrow ${formatTime(iso)}`
  if (isSameDay(due, addDays(now, -1))) return `Yesterday ${formatTime(iso)}`
  return `${formatDate(iso)} ${formatTime(iso)}`
}

export function countdown(toIso: string, now = new Date()): string {
  const diff = new Date(toIso).getTime() - now.getTime()
  const abs = Math.abs(diff)
  const mins = Math.floor(abs / 60000)
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  if (hours <= 0) return `${mins}m`
  return `${hours}h ${rem}m`
}

export function relativeUntil(iso: string, now = new Date()): string {
  const diff = new Date(iso).getTime() - now.getTime()
  if (diff <= 0) return 'now'
  return `in ${countdown(iso, now)}`
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

export function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function timeAgo(iso: string, now = new Date()): string {
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} Mins Ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} Hours Ago`
  const days = Math.floor(hours / 24)
  return `${days} Day${days === 1 ? '' : 's'} Ago`
}
