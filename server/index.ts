import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { streamSSE } from 'hono/streaming'
import type { ZodType } from 'zod'
import { buildWeeklyReport, reportToHtml } from '../src/utils/report'
import { uid } from '../src/utils/time'
import * as repo from './db'
import { HttpError } from './errors'
import { broadcast, clientCount, subscribe } from './hub'
import {
  actionCreate,
  actionPatch,
  convertBody,
  hubLogCreate,
  meetingCreate,
  meetingPatch,
  taskCreate,
  taskPatch,
} from './validate'

const app = new Hono()
const PORT = Number(process.env.PORT ?? 8787)

app.use('/api/*', logger())
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  }),
)

function push(state = repo.getState()) {
  broadcast(state)
  return state
}

async function readBody<T>(c: { req: { json: () => Promise<unknown> } }, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request')
  }
  return parsed.data
}

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'nhih-ops-api',
    clients: clientCount(),
    at: new Date().toISOString(),
  }),
)

app.get('/api/state', (c) => c.json(repo.getState()))

app.get('/api/reports/weekly', (c) => {
  const report = buildWeeklyReport(repo.getState())
  if (c.req.query('format') === 'html') {
    c.header('Content-Disposition', `inline; filename="NHIH-weekly-ops-report.html"`)
    return c.html(reportToHtml(report))
  }
  return c.json(report)
})

app.get('/api/stream', (c) =>
  streamSSE(c, async (stream) => {
    let closed = false
    const send = (state: ReturnType<typeof repo.getState>) => {
      if (closed) return
      void stream.writeSSE({ data: JSON.stringify(state) })
    }
    const unsubscribe = subscribe(send)
    send(repo.getState())
    c.req.raw.signal.addEventListener('abort', () => {
      closed = true
      unsubscribe()
    })
    while (!closed) {
      await stream.sleep(15000)
      if (!closed) await stream.writeSSE({ event: 'ping', data: 'ok' })
    }
  }),
)

app.post('/api/tasks', async (c) => {
  const body = await readBody(c, taskCreate)
  return c.json(
    push(
      repo.addTask({
        ...body,
        id: body.id || uid('t'),
        createdAt: body.createdAt || new Date().toISOString(),
      }),
    ),
  )
})

app.patch('/api/tasks/:id', async (c) => {
  const patch = await readBody(c, taskPatch)
  return c.json(push(repo.updateTask(c.req.param('id'), patch)))
})

app.post('/api/meetings', async (c) => {
  const body = await readBody(c, meetingCreate)
  return c.json(
    push(
      repo.addMeeting({
        ...body,
        id: body.id || uid('mtg'),
      }),
    ),
  )
})

app.patch('/api/meetings/:id', async (c) => {
  const patch = await readBody(c, meetingPatch)
  return c.json(push(repo.updateMeeting(c.req.param('id'), patch)))
})

app.post('/api/actions', async (c) => {
  const body = await readBody(c, actionCreate)
  return c.json(
    push(
      repo.addActionItem({
        ...body,
        id: body.id || uid('a'),
      }),
    ),
  )
})

app.post('/api/actions/:id/convert', async (c) => {
  const body = await readBody(c, convertBody).catch(() => ({ assignedBy: 'm1' }))
  return c.json(push(repo.convertAction(c.req.param('id'), body.assignedBy || 'm1')))
})

app.patch('/api/actions/:id', async (c) => {
  const patch = await readBody(c, actionPatch)
  return c.json(push(repo.updateActionItem(c.req.param('id'), patch)))
})

app.post('/api/hub-log', async (c) => {
  const body = await readBody(c, hubLogCreate)
  return c.json(
    push(
      repo.addHubLog({
        ...body,
        id: body.id || uid('log'),
        at: body.at || new Date().toISOString(),
      }),
    ),
  )
})

app.post('/api/reset', (c) => c.json(push(repo.resetState())))

if (existsSync('dist/index.html')) {
  app.use('/assets/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

setInterval(() => {
  const next = repo.tickOverdue()
  if (next) broadcast(next)
}, 15000)

const server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`NHIH ops API on http://localhost:${info.port}`)
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other API with: kill $(lsof -ti :${PORT})`)
    process.exit(1)
  }
  throw err
})
