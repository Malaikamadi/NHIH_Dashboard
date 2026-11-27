import { useState } from 'react'
import { useOps } from '../store/OpsContext'
import { displayStatus, memberNames } from '../utils/metrics'
import { TaskUpdatePanel } from './TaskUpdatePanel'
import { DeskPagination, useDeskPagination } from './DeskPagination'

export type WorkFilter = 'all' | 'active' | 'overdue' | 'high'
export function MobileWorkQueue({ initialFilter = 'active', onCreate }: { initialFilter?: WorkFilter; onCreate: () => void }) {
  const { state } = useOps()
  const [filter, setFilter] = useState<WorkFilter>(initialFilter)
  const [view, setView] = useState<'list' | 'board'>('list')
  const [owner, setOwner] = useState('')
  const [priority, setPriority] = useState('')
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
    return match && (!owner || t.assignedTo.includes(owner)) && (!priority || t.priority === priority) && (t.title + ' ' + memberNames(state.members,t.assignedTo)).toLowerCase().includes(query.toLowerCase())
  }).sort((a,b) => Number(displayStatus(a,now)==='completed')-Number(displayStatus(b,now)==='completed') || Number(displayStatus(b,now)==='overdue')-Number(displayStatus(a,now)==='overdue') || ['critical','high','medium','low'].indexOf(a.priority)-['critical','high','medium','low'].indexOf(b.priority) || +new Date(a.dueDate) - +new Date(b.dueDate))
  const paging = useDeskPagination(tasks, JSON.stringify([filter,query,owner,priority,view]))
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
      <div className="office-task-tools"><label>Owner<select value={owner} onChange={e=>setOwner(e.target.value)}><option value="">All owners</option>{state.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="">All priorities</option>{["critical","high","medium","low"].map(p=><option key={p}>{p}</option>)}</select></label><div className="office-view-switch"><button type="button" aria-pressed={view==="list"} onClick={()=>setView("list")}>List</button><button type="button" aria-pressed={view==="board"} onClick={()=>setView("board")}>Board</button></div><button type="button" className="work-create-fab" onClick={onCreate}>＋ New task</button></div>
      <div className="work-list-head"><strong>{tasks.length} {tasks.length===1?'task':'tasks'}</strong><span>Overdue and priority first</span></div>
      {view === "board" ? <div className="office-board">{(["not_started","in_progress","under_review","overdue","completed"] as const).map(status=><section key={status}><h3>{status.replaceAll("_"," ")} <small>{tasks.filter(t=>displayStatus(t,now)===status).length}</small></h3>{paging.items.filter(t=>displayStatus(t,now)===status).map(t=><button type="button" key={t.id} onClick={()=>setSelected(t.id)}><small>{t.priority} priority</small><strong>{t.title}</strong><span>{memberNames(state.members,t.assignedTo)}</span><span>{t.progress}% complete</span></button>)}</section>)}</div> : tasks.length ? <div className="work-queue-list"><div className="office-table-head"><span>Task</span><span>Owner / due date</span><span>Priority / status</span><span>Progress</span></div>{paging.items.map(t=><button type="button" key={t.id} className={'work-queue-card priority-'+t.priority} onClick={()=>setSelected(t.id)}><div className="work-card-top"><span className="work-priority">{t.priority} priority</span><span className={displayStatus(t,now)==='overdue'?'work-overdue':'work-status'}>{displayStatus(t,now).replaceAll('_',' ')}</span></div><strong>{t.title}</strong><div className="work-card-meta"><span>◉ {memberNames(state.members,t.assignedTo)}</span><span>Due {new Date(t.dueDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></div><div className="work-card-bottom"><div className="work-progress-track"><span style={{width:t.progress+'%'}} /></div><b>{t.progress}%</b><span aria-hidden="true">›</span></div></button>)}</div> : <div className="work-empty">No tasks match this view. Try another filter or search.</div>}
      <DeskPagination page={paging.page} pages={paging.pages} total={paging.total} onPage={paging.onPage}/>
    </>}
  </main>
}
