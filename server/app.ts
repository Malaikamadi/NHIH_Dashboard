import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { buildWeeklyReport, reportToHtml } from '../src/utils/report'
import { uid } from '../src/utils/time'
import * as repo from './db'
import { HttpError } from './errors'
import { isValidOperatorCode } from './operator'
import { broadcast, clientCount, subscribe } from './hub'
import {
  actionCreate,
  actionPatch,
  activityCreate,
  activityPatch,
  convertBody,
  hubLogCreate,
  hubLogPatch,
  meetingCreate,
  meetingPatch,
  restoreBody,
  taskCreate,
  taskPatch,
} from './validate'

const api = new Hono()

api.use('*', logger())
api.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Operator-Code'],
  }),
)

api.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  c.header('CDN-Cache-Control', 'no-store')
  c.header('Vercel-CDN-Cache-Control', 'no-store')
})

api.use('*', async (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') return next()
  const path = c.req.path
  if (
    path === '/unlock' ||
    path === '/operator/unlock' ||
    path.endsWith('/unlock') ||
    path.endsWith('/operator/unlock')
  ) {
    return next()
  }
  const given = c.req.header('x-operator-code') ?? ''
  if (!isValidOperatorCode(given)) {
    throw new HttpError(401, 'Operator access required')
  }
  return next()
})

async function push(state?: Awaited<ReturnType<typeof repo.getState>>) {
  const next = state ?? (await repo.getState())
  broadcast(next)
  return next
}

async function readBody<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>): Promise<T> {
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

api.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500)
})

api.get('/health', async (c) =>
  c.json({
    ok: true,
    service: 'nhih-ops-api',
    storage: repo.persistence(),
    clients: clientCount(),
    at: new Date().toISOString(),
  }),
)

api.post('/unlock', async (c) => {
  const body = await readBody(c, z.object({ code: z.string().trim().min(1, 'Access code is required') }))
  if (!isValidOperatorCode(body.code)) throw new HttpError(401, 'Invalid access code')
  return c.json({ ok: true })
})

api.post('/operator/unlock', async (c) => {
  const body = await readBody(c, z.object({ code: z.string().trim().min(1, 'Access code is required') }))
  if (!isValidOperatorCode(body.code)) throw new HttpError(401, 'Invalid access code')
  return c.json({ ok: true })
})

api.get('/state', async (c) => c.json(await repo.getState()))

api.get('/report', async (c) => {
  const report = buildWeeklyReport(await repo.getState())
  if (c.req.query('format') === 'html') {
    c.header('Content-Disposition', `inline; filename="NHIH-weekly-ops-report.html"`)
    return c.html(reportToHtml(report))
  }
  return c.json(report)
})

api.get('/reports/weekly', async (c) => {
  const report = buildWeeklyReport(await repo.getState())
  if (c.req.query('format') === 'html') {
    c.header('Content-Disposition', `inline; filename="NHIH-weekly-ops-report.html"`)
    return c.html(reportToHtml(report))
  }
  return c.json(report)
})

api.get('/stream', (c) =>
  streamSSE(c, async (stream) => {
    let closed = false
    const send = (state: Awaited<ReturnType<typeof repo.getState>>) => {
      if (closed) return
      void stream.writeSSE({ data: JSON.stringify(state) })
    }
    const unsubscribe = subscribe(send)
    send(await repo.getState())
    c.req.raw.signal.addEventListener('abort', () => {
      closed = true
      unsubscribe()
    })
    while (!closed) {
      await stream.sleep(4000)
      if (!closed) send(await repo.getState())
    }
  }),
)

api.post('/tasks', async (c) => {
  const body = await readBody(c, taskCreate)
  return c.json(
    await push(
      await repo.addTask({
        ...body,
        id: body.id || uid('t'),
        createdAt: body.createdAt || new Date().toISOString(),
      }),
    ),
  )
})

api.patch('/task', async (c) => {
  const id = c.req.query('id')
  if (!id) throw new HttpError(400, 'Task id is required')
  const patch = await readBody(c, taskPatch)
  return c.json(await push(await repo.updateTask(id, patch)))
})

api.patch('/tasks/:id', async (c) => {
  const patch = await readBody(c, taskPatch)
  return c.json(await push(await repo.updateTask(c.req.param('id'), patch)))
})

api.post('/meetings', async (c) => {
  const body = await readBody(c, meetingCreate)
  return c.json(
    await push(
      await repo.addMeeting({
        ...body,
        id: body.id || uid('mtg'),
      }),
    ),
  )
})

api.patch('/meeting', async (c) => {
  const id = c.req.query('id')
  if (!id) throw new HttpError(400, 'Meeting id is required')
  const patch = await readBody(c, meetingPatch)
  return c.json(await push(await repo.updateMeeting(id, patch)))
})

api.patch('/meetings/:id', async (c) => {
  const patch = await readBody(c, meetingPatch)
  return c.json(await push(await repo.updateMeeting(c.req.param('id'), patch)))
})

api.post('/activities', async (c) => {
  const body = await readBody(c, activityCreate)
  return c.json(
    await push(
      await repo.addActivity({
        ...body,
        id: body.id || uid('act'),
        kindOther: body.kind === 'other' ? body.kindOther : '',
        facility: body.facility || undefined,
      }),
    ),
  )
})

api.patch('/activity', async (c) => {
  const id = c.req.query('id')
  if (!id) throw new HttpError(400, 'Activity id is required')
  const patch = await readBody(c, activityPatch)
  return c.json(await push(await repo.updateActivity(id, patch)))
})

api.post('/actions', async (c) => {
  const body = await readBody(c, actionCreate)
  return c.json(
    await push(
      await repo.addActionItem({
        ...body,
        id: body.id || uid('a'),
      }),
    ),
  )
})

api.post('/convert', async (c) => {
  const body = await readBody(
    c,
    z.object({
      actionId: z.string().min(1),
      assignedBy: z.string().min(1).optional().default('m1'),
    }),
  )
  return c.json(await push(await repo.convertAction(body.actionId, body.assignedBy || 'm1')))
})

api.post('/actions/:id/convert', async (c) => {
  const body = await readBody(c, convertBody).catch(() => ({ assignedBy: 'm1' }))
  return c.json(await push(await repo.convertAction(c.req.param('id'), body.assignedBy || 'm1')))
})

api.patch('/action', async (c) => {
  const id = c.req.query('id')
  if (!id) throw new HttpError(400, 'Action id is required')
  const patch = await readBody(c, actionPatch)
  return c.json(await push(await repo.updateActionItem(id, patch)))
})

api.patch('/actions/:id', async (c) => {
  const patch = await readBody(c, actionPatch)
  return c.json(await push(await repo.updateActionItem(c.req.param('id'), patch)))
})

api.post('/hub-log', async (c) => {
  const body = await readBody(c, hubLogCreate)
  return c.json(
    await push(
      await repo.addHubLog({
        ...body,
        id: body.id || uid('log'),
        at: body.at || new Date().toISOString(),
      }),
    ),
  )
})

api.patch('/log', async (c) => {
  const id = c.req.query('id')
  if (!id) throw new HttpError(400, 'Hub log id is required')
  const patch = await readBody(c, hubLogPatch)
  return c.json(await push(await repo.updateHubLog(id, patch)))
})

api.delete('/task', async (c) => {
  const id = c.req.query('id')
  if (!id) throw new HttpError(400, 'Task id is required')
  return c.json(await push(await repo.removeTask(id)))
})

api.delete('/meeting', async (c) => {
  const id = c.req.query('id')
  if (!id) throw new HttpError(400, 'Meeting id is required')
  return c.json(await push(await repo.removeMeeting(id)))
})

api.delete('/activity', async (c) => {
  const id = c.req.query('id')
  if (!id) throw new HttpError(400, 'Activity id is required')
  return c.json(await push(await repo.removeActivity(id)))
})

api.delete('/action', async (c) => {
  const id = c.req.query('id')
  if (!id) throw new HttpError(400, 'Action id is required')
  return c.json(await push(await repo.removeActionItem(id)))
})

api.delete('/log', async (c) => {
  const id = c.req.query('id')
  if (!id) throw new HttpError(400, 'Hub log id is required')
  return c.json(await push(await repo.removeHubLog(id)))
})

api.post('/restore', async (c) => {
  const body = await readBody(c, restoreBody)
  return c.json(await push(await repo.restoreState(body)))
})

api.post('/reset', async (c) => c.json(await push(await repo.resetState())))

export const app = new Hono()
app.route('/api', api)
app.route('/', api)
