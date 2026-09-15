import type { IncomingMessage, ServerResponse } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import { app } from '../server/app'

export const config = {
  maxDuration: 30,
}

const nodeHandler = getRequestListener(app.fetch)

export default async function handler(
  req: IncomingMessage | Request,
  res?: ServerResponse,
) {
  try {
    if (res) {
      await nodeHandler(req as IncomingMessage, res)
      return
    }
    return await app.fetch(req as Request)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    if (res) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: message, stack }))
      return
    }
    return new Response(JSON.stringify({ error: message, stack }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
