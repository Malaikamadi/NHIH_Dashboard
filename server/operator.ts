import { timingSafeEqual } from 'node:crypto'
import { HttpError } from './errors'

export const DEFAULT_OPERATOR_CODE = 'nhih-ops'

function constantTimeMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function expectedOperatorCode(): string {
  const fromEnv = process.env.OPERATOR_CODE?.trim()
  if (fromEnv) return fromEnv
  if (process.env.VERCEL) return ''
  return DEFAULT_OPERATOR_CODE
}

export function isValidOperatorCode(given: string): boolean {
  const expected = expectedOperatorCode()
  return Boolean(expected) && constantTimeMatch(given, expected)
}

/**
 * The visitor register handles personal visit records and strictly requires
 * an explicitly configured, non-default OPERATOR_CODE on the server.
 */
export function configuredVisitorOperatorCode(): string | null {
  const fromEnv = process.env.OPERATOR_CODE?.trim()
  if (!fromEnv || fromEnv === DEFAULT_OPERATOR_CODE) return null
  return fromEnv
}

export function assertVisitorOperatorAccess(given: string): void {
  const expected = configuredVisitorOperatorCode()
  if (!expected) {
    throw new HttpError(
      503,
      'Visitor register requires a non-default OPERATOR_CODE to be configured on the server',
    )
  }
  const trimmed = given.trim()
  if (!trimmed || trimmed === DEFAULT_OPERATOR_CODE || !constantTimeMatch(trimmed, expected)) {
    throw new HttpError(401, 'Operator access required')
  }
}
