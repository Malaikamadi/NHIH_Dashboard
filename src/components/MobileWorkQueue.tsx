import { useState } from 'react'
import { useOps } from '../store/OpsContext'
import { displayStatus, memberNames } from '../utils/metrics'
import { TaskUpdatePanel } from './TaskUpdatePanel'

export type WorkFilter = 'all' | 'active' | 'overdue' | 'high'
export function MobileWorkQueue({ initialFilter = 'active', onCreate }: { initialFilter?: WorkFilter; onCreate: () => void }) {
  const { state } = useOps()
  const [filter, setFilter] = useState<WorkFilter>(initialFilter)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const now = new Date()
  const counts = {
    all: state.tasks.length,
    active: state.tasks.filter(t => displayStatus(t,now) !== 'completed').length,
    overdue: state.tasks.filter(t => displayStatus(t,now) === 'overdue').length,
    high: state.tasks.filter(t => displayStatus(t,now) !== 'completed' && ['high','critical'].includes(t.priority)).length,
  }
  const tasks = [...state.tasks].filter(t => {
    const status = displayStatus(t,now)
    const match = filter === 'all' || (filter === 'active' && status !== 'completed') || (filter === 'overdue' && status === 'overdue') || (filter === 'high' && status !== 'completed' && ['high','critical'].includes(t.priority))
    return match && (t.title + ' ' + memberNames(state.members,t.assignedTo)).toLowerCase().includes(query.toLowerCase())
  }).sort((a,b) => +new Date(a.dueDate) - +new Date(b.dueDate))
  const task = selected ? state.tasks.find(t => t.id === selected) : null
  return <main className="mobile-work-queue">
    {task ? <>
      <button className="work-back" type="button" onClick={() => setSelected(null)}>← Back to work queue</button>
      <div className="work-queue-heading"><span>WORKSPACE / TASK DETAILS</span><h1>{task.title}</h1><p>{memberNames(state.members,task.assignedTo)} · {task.priority} priority</p></div>
      <div className="work-progress"><div><strong>Completion</strong><b>{task.progress}%</b></div><div className="work-progress-track"><span style={{width:task.progress+'%'}} /></div></div>
      <TaskUpdatePanel key={task.id} selectedTaskId={task.id}/>
    </> : <>
      <div className="work-queue-heading"><span>OPERATIONS / WORK QUEUE</span><h1>Tasks</h1><p>Find, prioritize and update work across the Hub.</p></div>
      <div className="work-queue-filter" role="group" aria-label="Filter tasks">{(['all','active','overdue','high'] as const).map(key=><button key={key} type="button" className={filter===key?'selected':''} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{key==='high'?'High priority':key[0].toUpperCase()+key.slice(1)} <b>{counts[key]}</b></button>)}</div>
      <label className="work-search"><span className="sr-only">Search tasks or owners</span><input type="search" placeholder="Search tasks or team members…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div className="work-list-head"><strong>{tasks.length} {tasks.length===1?'task':'tasks'}</strong><span>Sorted by due date</span></div>
      {tasks.length ? <div className="work-queue-list">{tasks.map(t=><button type="button" key={t.id} className={'work-queue-card priority-'+t.priority} onClick={()=>setSelected(t.id)}><div className="work-card-top"><span className="work-priority">{t.priority} priority</span><span className={displayStatus(t,now)==='overdue'?'work-overdue':'work-status'}>{displayStatus(t,now).replaceAll('_',' ')}</span></div><strong>{t.title}</strong><div className="work-card-meta"><span>◉ {memberNames(state.members,t.assignedTo)}</span><span>Due {new Date(t.dueDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></div><div className="work-card-bottom"><div className="work-progress-track"><span style={{width:t.progress+'%'}} /></div><b>{t.progress}%</b><span aria-hidden="true">›</span></div></button>)}</div> : <div className="work-empty">No tasks match this view. Try another filter or search.</div>}
      <button type="button" className="work-create-fab" onClick={onCreate}>＋ New task</button>
    </>}
  </main>
}
