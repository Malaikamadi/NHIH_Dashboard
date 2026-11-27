import { getPostgresPool, postgresActive } from './postgres'
import { HttpError } from './errors'
let ready: Promise<unknown> | undefined
async function pool() {
  if (!postgresActive()) throw new HttpError(503,'Power tracking requires PostgreSQL')
  const p=getPostgresPool()
  if (!ready) ready=p.query("CREATE TABLE IF NOT EXISTS hub_power_events (id bigserial PRIMARY KEY, source text NOT NULL CHECK (source IN ('grid','generator')), changed_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL DEFAULT '')").catch(e=>{ready=undefined;throw e})
  await ready
  return p
}
export async function powerStatus() {
  const p=await pool()
  const r=await p.query('SELECT source, changed_at AS "changedAt" FROM hub_power_events ORDER BY id DESC LIMIT 1')
  return r.rows[0] ?? {source:null,changedAt:null}
}
export async function powerHistory() {
  const p=await pool()
  return (await p.query('SELECT id::text, source, changed_at AS "changedAt", reason FROM hub_power_events ORDER BY id DESC LIMIT 100')).rows
}
export async function changePower(source:'grid'|'generator',reason:string) {
  const p=await pool()
  const c=await p.connect()
  try {
    await c.query('BEGIN')
    await c.query('LOCK TABLE hub_power_events IN EXCLUSIVE MODE')
    const last=await c.query('SELECT source FROM hub_power_events ORDER BY id DESC LIMIT 1')
    if(last.rows[0]?.source!==source) await c.query('INSERT INTO hub_power_events(source,reason) VALUES($1,$2)',[source,reason])
    await c.query('COMMIT')
  } catch(e) {await c.query('ROLLBACK');throw e} finally {c.release()}
  return powerStatus()
}
