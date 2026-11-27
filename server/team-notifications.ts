import { getPostgresPool, postgresActive } from './postgres'
import { HttpError } from './errors'

function pool() {
  if (!postgresActive()) throw new HttpError(503, 'Notifications require local PostgreSQL')
  return getPostgresPool()
}
export async function listNotifications() {
  const db = pool()
  const { rows } = await db.query(`SELECT m.id, m.name, m.role,
    COALESCE(n.email, '') AS email, COALESCE(n.enabled, false) AS enabled
    FROM members m LEFT JOIN member_notifications n
    ON n.member_id = m.id AND n.member_name = m.name ORDER BY m.name`)
  const history = await db.query(`SELECT h.week_start, h.member_id, m.name, h.status, h.task_count, h.updated_at
    FROM notification_history h LEFT JOIN members m ON m.id=h.member_id
    ORDER BY h.updated_at DESC LIMIT 100`)
  return { members: rows, history: history.rows }
}
export async function saveNotification(id: string, email: string, enabled: boolean) {
  const db = pool()
  if (enabled && !email) throw new HttpError(400, 'Email required to enable reminders')
  try {
    const result = await db.query(`INSERT INTO member_notifications (member_id, member_name, email, enabled)
      SELECT id, name, $2, $3 FROM members WHERE id=$1
      ON CONFLICT (member_id) DO UPDATE SET member_name=EXCLUDED.member_name,
      email=EXCLUDED.email, enabled=EXCLUDED.enabled, updated_at=now()`, [id,email,enabled])
    if (!result.rowCount) throw new HttpError(404, 'Member not found')
  } catch (error) {
    if ((error as {code?: string}).code === '23505') throw new HttpError(409, 'Email already assigned')
    throw error
  }
  return listNotifications()
}
