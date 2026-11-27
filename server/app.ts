import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { buildOpsReport, parseReportPeriod, reportToHtml } from '../src/utils/report'
import { uid } from '../src/utils/time'
import * as repo from './db'
import { HttpError } from './errors'
import { assertVisitorOperatorAccess, isValidOperatorCode } from './operator'
import { broadcast, clientCount, subscribe } from './hub'
import * as visitors from './visitors'
import * as notifications from './team-notifications'
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
  visitorWalkInCreate,
} from './validate'

import * as power from './power'
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

function isVisitorPath(path: string): boolean {
  return (
    path === '/visitors' ||
    path.startsWith('/visitors/') ||
    path === '/api/visitors' ||
    path.startsWith('/api/visitors/')
  )
}

function isVisitorSummaryPath(path: string): boolean {
  return path === '/visitors/summary' || path === '/api/visitors/summary'
}

api.use('*', async (c, next) => {
  const path = c.req.path
  if (c.req.method === 'OPTIONS') return next()
  if (isVisitorPath(path)) {
    if (isVisitorSummaryPath(path) && (c.req.method === 'GET' || c.req.method === 'HEAD')) {
      return next()
    }
    const given = c.req.header('x-operator-code') ?? ''
    assertVisitorOperatorAccess(given)
    return next()
  }
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return next()
  if (c.req.method === 'POST' && (path === '/notification-ack' || path === '/api/notification-ack')) return next()
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
    storageStatus: repo.persistenceStatus(),
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

api.get('/power/status',async c=>c.json(await power.powerStatus()))
api.get('/power/history',async c=>{assertVisitorOperatorAccess(c.req.header('x-operator-code')??'');return c.json(await power.powerHistory())})
api.post('/power/status',async c=>{assertVisitorOperatorAccess(c.req.header('x-operator-code')??'');const body=await readBody(c,z.object({source:z.enum(['grid','generator']),reason:z.string().trim().max(500).default('')}));return c.json(await power.changePower(body.source,body.reason))})
api.get('/state', async (c) => c.json(await repo.getState()))

api.get('/report', async (c) => {
  const period = parseReportPeriod(c.req.query('period'))
  const report = buildOpsReport(await repo.getState(), period)
  if (c.req.query('format') === 'html') {
    c.header('Content-Disposition', `inline; filename="NHIH-${period.toLowerCase()}-ops-report.html"`)
    return c.html(reportToHtml(report))
  }
  return c.json(report)
})

api.get('/reports/weekly', async (c) => {
  const period = parseReportPeriod(c.req.query('period') ?? 'Weekly')
  const report = buildOpsReport(await repo.getState(), period)
  if (c.req.query('format') === 'html') {
    c.header('Content-Disposition', `inline; filename="NHIH-${period.toLowerCase()}-ops-report.html"`)
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
  const { assignedBy, ...item } = body
  return c.json(
    await push(
      await repo.addActionItem(
        {
          ...item,
          id: item.id || uid('a'),
        },
        assignedBy,
      ),
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
  const status =
    body.status ??
    (body.kind === 'extract_restored'
      ? 'completed'
      : body.kind === 'extract_failed' || body.kind === 'late_reporting'
        ? 'overdue'
        : 'open')
  return c.json(
    await push(
      await repo.addHubLog({
        ...body,
        status,
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

api.get('/visitors/summary', async (c) => c.json(await visitors.getVisitorSummary()))

api.get('/visitors', async (c) => c.json(await visitors.listVisitorRegister()))

api.post('/visitors/sync', async (c) => c.json(await visitors.syncVisitorsFromGoogleSheets()))

api.post('/visitors/walk-in', async (c) => {
  const body = await readBody(c, visitorWalkInCreate)
  return c.json(await visitors.registerWalkIn(body), 201)
})

api.post('/visitors/:id/check-in', async (c) =>
  c.json(await visitors.checkInVisit(c.req.param('id'))),
)

api.post('/visitors/:id/check-out', async (c) =>
  c.json(await visitors.checkOutVisit(c.req.param('id'))),
)

api.get('/team-notifications', async (c) => {
  assertVisitorOperatorAccess(c.req.header('x-operator-code') ?? '')
  return c.json(await notifications.listNotifications())
})
api.patch('/team-notifications/:id', async (c) => {
  assertVisitorOperatorAccess(c.req.header('x-operator-code') ?? '')
  const body = await readBody(c, z.object({
    email: z.union([z.string().trim().email().max(254), z.literal('')]),
    enabled: z.boolean(),
  }))
  return c.json(await notifications.saveNotification(c.req.param('id'), body.email, body.enabled))
})

api.get('/notification-ack', (c) => {
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
  return c.html(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NHIH Receipt Confirmation</title><body style="font:17px Arial;background:#edf4f0;color:#103c35;margin:0;padding:24px"><main style="max-width:480px;margin:40px auto;background:white;padding:24px;border-radius:12px"><small>MINISTRY OF HEALTH | SIERRA LEONE</small><h1>National Health Information Hub</h1><h2>Acknowledge receipt</h2><p>Confirm that you received your operational briefing. This does not complete any assignment.</p><button id="confirm" style="background:#103c35;color:white;padding:14px;border:0;border-radius:6px">Confirm receipt</button><p id="result" role="status"></p></main><script>const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);const button=document.getElementById('confirm');const result=document.getElementById('result');button.onclick=async()=>{button.disabled=true;try{const r=await fetch('/api/notification-ack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});result.textContent=r.ok?'Thank you. Your acknowledgement has been recorded.':r.status===404?'This link is invalid or expired.':'Unable to confirm. Please try again.';if(!r.ok&&r.status!==404)button.disabled=false;}catch{result.textContent='Connection failed. Please try again.';button.disabled=false;}};</script></body></html>`)
})
api.post('/notification-ack', async (c) => {
  const body = await readBody(c, z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}))
  if (!await notifications.acknowledgeNotification(body.token)) throw new HttpError(404,'Invalid or expired link')
  return c.json({ok:true})
})

export const app = new Hono()
app.route('/api', api)
app.route('/', api)
