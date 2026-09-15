export default function handler(
  _req: { method?: string },
  res?: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void },
) {
  const body = JSON.stringify({ ok: true, ping: true })
  if (res) {
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end(body)
    return
  }
  return new Response(body, { headers: { 'content-type': 'application/json' } })
}
