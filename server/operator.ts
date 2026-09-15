export function expectedOperatorCode(): string {
  const fromEnv = process.env.OPERATOR_CODE?.trim()
  if (fromEnv) return fromEnv
  if (process.env.VERCEL) return ''
  return 'nhih-ops'
}

export function isValidOperatorCode(given: string): boolean {
  const expected = expectedOperatorCode()
  return Boolean(expected) && given === expected
}
