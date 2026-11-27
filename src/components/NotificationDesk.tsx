import { useEffect, useState } from 'react'
import { getOperatorCode } from '../access'
type Member = { id: string; name: string; role: string; email: string; enabled: boolean }
type History = { week_start: string; member_id: string; name: string | null; status: string; task_count: number }
type Directory = { members: Member[]; history: History[] }
async function request(path = '', body?: {email: string; enabled: boolean}): Promise<Directory> {
  const res = await fetch('/api/team-notifications' + path, {
    method: body ? 'PATCH' : 'GET', cache: 'no-store',
    headers: {'Content-Type': 'application/json', 'X-Operator-Code': getOperatorCode()},
    ...(body ? {body: JSON.stringify(body)} : {}),
  })
  if (!res.ok) throw new Error('Notification request failed (' + res.status + ')')
  return res.json()
}
export function NotificationDesk() {
  const [data,setData] = useState<Directory | null>(null)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [saved,setSaved] = useState('')
  useEffect(() => { request().then(setData).catch(e => setError(String(e))) }, [])
  function edit(id: string, patch: Partial<Member>) {
    setData(old => old && ({...old, members: old.members.map(m => m.id === id ? {...m,...patch} : m)}))
    setSaved('')
  }
  return <section className="paper" style={{padding: '1rem', maxWidth: 900, margin: '1rem auto'}}>
    <h2>Team Notifications</h2>
    <p>Weekly task reminders · Monday, 08:00 GMT (once the server schedule is enabled).</p>
    {error && <p role="alert" className="warn-text">{error}</p>}
    {saved && <p role="status">{saved}</p>}
    {!data && !error && <p>Loading directory…</p>}
    {data && <><p>{data.members.length} members · {data.members.filter(m => m.enabled).length} enabled</p>
    {data.members.map(m => <form key={m.id} className="admin-form" style={{borderBottom:'1px solid #8885',padding:'1rem 0'}} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError(''); setSaved('')
      try {
        const result = await request('/'+encodeURIComponent(m.id), {email:m.email.trim(),enabled:m.enabled})
        setData(old => old && ({history:result.history,members:old.members.map(row => row.id === m.id ? (result.members.find(x => x.id === m.id) ?? row) : row)}))
        setSaved(m.name + ' saved')
      } catch(e) {setError(String(e))} finally {setBusy(false)}
    }}>
      <strong>{m.name}</strong><span>{m.role}</span>
      <label>Email<input type="email" value={m.email} maxLength={254} required={m.enabled} disabled={busy} onChange={e => edit(m.id,{email:e.target.value,enabled:false})}/></label>
      <label><input type="checkbox" checked={m.enabled} disabled={busy || !m.email.trim()} onChange={e => edit(m.id,{enabled:e.target.checked})}/> I have verified this address; enable weekly reminders</label>
      <button className="primary-btn" disabled={busy} type="submit">Save preferences</button>
    </form>)}
    <h3>Delivery history</h3>
    {!data.history.length && <p>No notifications submitted yet.</p>}
    {data.history.map(h => <p key={h.week_start+h.member_id}>{h.week_start.slice(0,10)} · {h.name ?? h.member_id} · {h.task_count} tasks · {h.status}</p>)}
    </>}
  </section>
}
