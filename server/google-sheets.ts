import { createHash, createSign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { VisitorColumnMapping, VisitorSkippedRow } from '../src/types'
import { HttpError } from './errors'

const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token'
export const DEFAULT_GOOGLE_SHEETS_TAB = 'Form Responses 1'

export interface ServiceAccountCredentials {
  client_email: string
  private_key: string
  token_uri?: string
}

export interface ParsedSheetRegistration {
  rowNumber: number
  sourceKey: string
  registeredAt: string
  fullName: string
  organization: string
  purpose: string
}

export interface ParsedSheetResult {
  columnMapping: VisitorColumnMapping
  records: ParsedSheetRegistration[]
  skipped: VisitorSkippedRow[]
}

interface CachedToken {
  accessToken: string
  expiresAtMs: number
}

let cachedToken: CachedToken | null = null

export function googleSheetsSpreadsheetId(): string {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || ''
}

export function googleSheetsTabName(): string {
  return process.env.GOOGLE_SHEETS_TAB_NAME?.trim() || DEFAULT_GOOGLE_SHEETS_TAB
}

export function loadServiceAccountCredentials(): ServiceAccountCredentials | null {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE?.trim()
  if (keyFile) {
    if (!existsSync(keyFile)) {
      throw new HttpError(503, `Google service account key file not found: ${keyFile}`)
    }
    try {
      const parsed = JSON.parse(readFileSync(keyFile, 'utf8')) as Partial<ServiceAccountCredentials>
      return validateServiceAccount(parsed)
    } catch (err) {
      if (err instanceof HttpError) throw err
      throw new HttpError(503, 'Google service account key file is not valid JSON')
    }
  }

  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as Partial<ServiceAccountCredentials>
      return validateServiceAccount(parsed)
    } catch (err) {
      if (err instanceof HttpError) throw err
      throw new HttpError(503, 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON')
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim()
  if (email || key) {
    return validateServiceAccount({
      client_email: email,
      private_key: key?.replace(/\\n/g, '\n'),
    })
  }

  return null
}

function validateServiceAccount(
  raw: Partial<ServiceAccountCredentials>,
): ServiceAccountCredentials {
  const email = raw.client_email?.trim()
  const privateKey = raw.private_key?.replace(/\\n/g, '\n').trim()
  if (!email || !privateKey) {
    throw new HttpError(
      503,
      'Google service account credentials must include client_email and private_key',
    )
  }
  return {
    client_email: email,
    private_key: privateKey,
    token_uri: raw.token_uri?.trim() || GOOGLE_TOKEN_URI,
  }
}

export function googleSheetsConfigured(): boolean {
  if (!googleSheetsSpreadsheetId()) return false
  try {
    return Boolean(loadServiceAccountCredentials())
  } catch {
    return false
  }
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function getGoogleAccessToken(creds: ServiceAccountCredentials): Promise<string> {
  const nowMs = Date.now()
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > nowMs) {
    return cachedToken.accessToken
  }

  const iat = Math.floor(nowMs / 1000)
  const exp = iat + 3600
  const tokenUri = creds.token_uri || GOOGLE_TOKEN_URI

  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: creds.client_email,
      scope: SHEETS_READONLY_SCOPE,
      aud: tokenUri,
      iat,
      exp,
    }),
  )

  const unsignedJwt = `${header}.${claimSet}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedJwt)
  signer.end()
  const signature = base64UrlEncode(signer.sign(creds.private_key))
  const assertion = `${unsignedJwt}.${signature}`

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new HttpError(
      502,
      `Google OAuth token exchange failed (${res.status})${detail ? `: ${detail.slice(0, 160)}` : ''}`,
    )
  }

  const body = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) {
    throw new HttpError(502, 'Google OAuth response did not include an access token')
  }

  cachedToken = {
    accessToken: body.access_token,
    expiresAtMs: nowMs + (body.expires_in ?? 3600) * 1000,
  }
  return body.access_token
}

export async function fetchGoogleSheetValues(): Promise<{
  spreadsheetId: string
  tabName: string
  values: string[][]
}> {
  const spreadsheetId = googleSheetsSpreadsheetId()
  if (!spreadsheetId) {
    throw new HttpError(503, 'GOOGLE_SHEETS_SPREADSHEET_ID is not configured on the server')
  }
  const creds = loadServiceAccountCredentials()
  if (!creds) {
    throw new HttpError(
      503,
      'Google Sheets service account credentials are not configured on the server',
    )
  }
  const tabName = googleSheetsTabName()
  const accessToken = await getGoogleAccessToken(creds)
  const quotedTab = `'${tabName.replace(/'/g, "''")}'`
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(quotedTab)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new HttpError(
      502,
      `Google Sheets API request failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    )
  }

  const body = (await res.json()) as { values?: unknown[][] }
  const values = (body.values ?? []).map((row) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [],
  )
  return { spreadsheetId, tabName, values }
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isSensitiveContactHeader(normalized: string): boolean {
  return /\b(email|e mail|phone|mobile|telephone|tel|contact|whatsapp)\b/.test(normalized)
}

function findColumnIndex(
  headers: string[],
  overrideEnv: string | undefined,
  exactAliases: string[],
  regexMatchers: RegExp[],
): number {
  const normalizedHeaders = headers.map(normalizeHeader)
  if (overrideEnv?.trim()) {
    const target = normalizeHeader(overrideEnv)
    const idx = normalizedHeaders.findIndex(
      (h) => h === target && !isSensitiveContactHeader(h),
    )
    return idx
  }

  for (const alias of exactAliases) {
    const idx = normalizedHeaders.findIndex(
      (h) => h === alias && !isSensitiveContactHeader(h),
    )
    if (idx !== -1) return idx
  }

  for (const pattern of regexMatchers) {
    const idx = normalizedHeaders.findIndex(
      (h) => pattern.test(h) && !isSensitiveContactHeader(h),
    )
    if (idx !== -1) return idx
  }

  return -1
}

export interface ResolvedColumnIndices {
  timestampIdx: number
  fullNameIdx: number
  organizationIdx: number
  purposeIdx: number
  mapping: VisitorColumnMapping
}

export function resolveColumnMapping(headers: string[]): ResolvedColumnIndices {
  if (!headers.length) {
    throw new HttpError(422, 'Sheet header row is empty; cannot verify column mapping')
  }

  const timestampIdx = findColumnIndex(
    headers,
    process.env.GOOGLE_SHEETS_COL_TIMESTAMP,
    ['timestamp', 'submission timestamp', 'submitted at', 'date and time', 'date time'],
    [/\btimestamp\b/, /\bsubmitted\b/],
  )

  const fullNameIdx = findColumnIndex(
    headers,
    process.env.GOOGLE_SHEETS_COL_NAME,
    ['full name', 'visitor full name', 'visitor name', 'visitors name', 'name'],
    [/\bfull name\b/, /\bvisitor.*name\b/, /^name$/],
  )

  const organizationIdx = findColumnIndex(
    headers,
    process.env.GOOGLE_SHEETS_COL_ORG,
    [
      'organization or unit',
      'organisation or unit',
      'organization unit',
      'organisation unit',
      'organization',
      'organisation',
      'unit',
      'institution',
      'affiliation',
      'department',
      'agency',
      'organization institution',
      'organisation institution',
    ],
    [/\borgani[sz]ation\b/, /\bunit\b/, /\binstitution\b/, /\baffiliation\b/, /\bdepartment\b/, /\bagency\b/],
  )

  const purposeIdx = findColumnIndex(
    headers,
    process.env.GOOGLE_SHEETS_COL_PURPOSE,
    ['purpose of visit', 'visit purpose', 'purpose', 'reason for visit', 'reason'],
    [/\bpurpose\b/, /\breason\b/],
  )

  const missing: string[] = []
  if (timestampIdx === -1) missing.push('submission timestamp')
  if (fullNameIdx === -1) missing.push('full name')
  if (organizationIdx === -1) missing.push('organization or unit')
  if (purposeIdx === -1) missing.push('visit purpose')

  if (missing.length > 0) {
    const found = headers.map((h) => h.trim()).filter(Boolean).join(', ') || '(none)'
    throw new HttpError(
      422,
      `Google Sheet column mapping verification failed. Missing: ${missing.join(', ')}. Detected headers: ${found}`,
    )
  }

  const used = new Set([timestampIdx, fullNameIdx, organizationIdx, purposeIdx])
  const ignoredColumns = headers
    .map((h, i) => ({ header: h.trim(), index: i }))
    .filter(({ header, index }) => Boolean(header) && !used.has(index))
    .map(({ header }) => header)

  return {
    timestampIdx,
    fullNameIdx,
    organizationIdx,
    purposeIdx,
    mapping: {
      timestamp: headers[timestampIdx].trim(),
      fullName: headers[fullNameIdx].trim(),
      organization: headers[organizationIdx].trim(),
      purpose: headers[purposeIdx].trim(),
      ignoredColumns,
    },
  }
}

/**
 * Parse a Google Forms submission timestamp into an ISO-8601 UTC string.
 * Naive timestamps (no timezone offset) are interpreted in Africa/Freetown (UTC+0, no DST).
 */
export function parseSubmissionTimestamp(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // ISO-8601 or YYYY-MM-DD[ T]HH:mm[:ss]
  const isoLike = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(
    trimmed,
  )
  if (isoLike) {
    if (isoLike[8]) {
      const parsed = new Date(trimmed)
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
    }
    const year = Number(isoLike[1])
    const month = Number(isoLike[2])
    const day = Number(isoLike[3])
    const hour = Number(isoLike[4] ?? 0)
    const minute = Number(isoLike[5] ?? 0)
    const second = Number(isoLike[6] ?? 0)
    return buildUtcIso(year, month, day, hour, minute, second)
  }

  // Slash or dash date with optional time and AM/PM, e.g. 11/20/2026 9:15:00 or 20/11/2026 09:15:00 AM
  const slashLike =
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(
      trimmed,
    )
  if (slashLike) {
    const first = Number(slashLike[1])
    const second = Number(slashLike[2])
    const year = Number(slashLike[3])
    let hour = Number(slashLike[4] ?? 0)
    const minute = Number(slashLike[5] ?? 0)
    const secondPart = Number(slashLike[6] ?? 0)
    const meridiem = slashLike[7]?.toUpperCase()

    if (meridiem) {
      if (hour < 1 || hour > 12) return null
      if (meridiem === 'AM' && hour === 12) hour = 0
      if (meridiem === 'PM' && hour !== 12) hour += 12
    }

    let month: number
    let day: number
    const preferDmy = (process.env.GOOGLE_SHEETS_DATE_ORDER || '').trim().toUpperCase() === 'DMY'
    if (first > 12 && second <= 12) {
      day = first
      month = second
    } else if (second > 12 && first <= 12) {
      month = first
      day = second
    } else if (preferDmy) {
      day = first
      month = second
    } else {
      month = first
      day = second
    }

    return buildUtcIso(year, month, day, hour, minute, secondPart)
  }

  // Fallback for explicit timezone strings (e.g. RFC 2822)
  const fallback = new Date(trimmed)
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toISOString()
  }
  return null
}

function buildUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string | null {
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null
  }
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date.toISOString()
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function buildSourceKey(parts: {
  spreadsheetId: string
  tabName: string
  registeredAt: string
  fullName: string
  organization: string
  purpose: string
}): string {
  const payload = JSON.stringify([
    parts.spreadsheetId.trim(),
    parts.tabName.trim(),
    parts.registeredAt,
    collapseSpaces(parts.fullName).toLowerCase(),
    collapseSpaces(parts.organization).toLowerCase(),
    collapseSpaces(parts.purpose).toLowerCase(),
  ])
  return createHash('sha256').update(payload).digest('hex')
}

export function parseSheetRows(
  values: string[][],
  options: { spreadsheetId: string; tabName: string },
): ParsedSheetResult {
  if (values.length === 0) {
    throw new HttpError(422, `Tab "${options.tabName}" is empty; header row is required`)
  }

  const resolved = resolveColumnMapping(values[0])
  const records: ParsedSheetRegistration[] = []
  const skipped: VisitorSkippedRow[] = []
  const seenKeys = new Set<string>()

  for (let i = 1; i < values.length; i++) {
    const row = values[i] ?? []
    const rowNumber = i + 1
    const hasAnyContent = row.some((cell) => cell.trim().length > 0)
    if (!hasAnyContent) continue

    const rawTimestamp = (row[resolved.timestampIdx] ?? '').trim()
    const fullName = collapseSpaces(row[resolved.fullNameIdx] ?? '')
    const organization = collapseSpaces(row[resolved.organizationIdx] ?? '')
    const purpose = collapseSpaces(row[resolved.purposeIdx] ?? '')

    if (!fullName) {
      skipped.push({ rowNumber, reason: 'Missing full name' })
      continue
    }

    const registeredAt = parseSubmissionTimestamp(rawTimestamp)
    if (!registeredAt) {
      skipped.push({
        rowNumber,
        reason: rawTimestamp
          ? `Unrecognized submission timestamp "${rawTimestamp}"`
          : 'Missing submission timestamp',
      })
      continue
    }

    const sourceKey = buildSourceKey({
      spreadsheetId: options.spreadsheetId,
      tabName: options.tabName,
      registeredAt,
      fullName,
      organization,
      purpose,
    })

    if (seenKeys.has(sourceKey)) {
      skipped.push({ rowNumber, reason: 'Duplicate submission within sheet' })
      continue
    }
    seenKeys.add(sourceKey)

    records.push({
      rowNumber,
      sourceKey,
      registeredAt,
      fullName,
      organization,
      purpose,
    })
  }

  return {
    columnMapping: resolved.mapping,
    records,
    skipped,
  }
}
