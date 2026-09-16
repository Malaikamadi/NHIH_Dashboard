import { app } from './app'

type NodeReq = {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type NodeRes = {
  statusCode: number 
  setHeader: (key: string, value: string) => void
  end: (chunk?: string | Buffer) => void 
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (value == null) return undefined
  return Array.isArray(value) ? value.join(',') : value
}

function requestPath(req: NodeReq): string {
  const candidates = [
    req.url,
    headerValue(req.headers['x-forwarded-uri']),
    headerValue(req.headers['x-invoke-path']),
  ].filter((value): value is string => Boolean(value))

  const normalized = candidates.map((value) => {
    if (value.startsWith('http')) {
      const parsed = new URL(value)
      return parsed.pathname + parsed.search
    }
    return value.startsWith('/') ? value : `/${value}`
  })

  return (
    normalized.find((value) => value.startsWith('/api/') && value.split('/').filter(Boolean).length > 1) ||
    normalized[0] ||
    '/'
  )
}

export default async function handler(req: NodeReq, res: NodeRes) {
  try {
    const proto = headerValue(req.headers['x-forwarded-proto']) || 'https'
    const host =
      headerValue(req.headers['x-forwarded-host']) || headerValue(req.headers.host) || 'localhost'
    const url = `${proto}://${host}${requestPath(req)}`
    const method = req.method || 'GET'
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      const next = headerValue(value)
      if (next) headers.set(key, next)
    }
    const init: RequestInit = { method, headers }
    if (method !== 'GET' && method !== 'HEAD' && req.body != null) {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    }
    const response = await app.fetch(new Request(url, init))
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: message, stack }))
  }
}
