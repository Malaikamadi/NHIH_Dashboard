import { useState } from 'react'
import { clearOperatorCode, isOperatorUnlocked } from '../access'
import { unlockOperator } from '../api'
import { AdminPanel } from './AdminPanel'
import { MobileOpsHome } from './MobileOpsHome'
import { MobileWorkQueue, type WorkFilter } from './MobileWorkQueue'
import mohLogo from '../assets/mohs-logo.jpg'
import { InstallApp } from './InstallApp'
import { PowerDesk } from './PowerDesk'
import { NotificationDesk } from './NotificationDesk'

function goDashboard() {
  window.history.pushState({}, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function OperatorDesk() {
  const [compact, setCompact] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(isOperatorUnlocked)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [workFilter, setWorkFilter] = useState<WorkFilter>('active')
  const [activeTab, setActiveTab] = useState<'task' | 'update' | 'meeting' | 'activity' | 'action' | 'log' | 'emr' | 'visitors' | 'power' | null>(null)

  const signOut = () => {
    setNotificationsOpen(false)
    clearOperatorCode()
    setUnlocked(false)
    setCode('')
    setError('')
    setActiveTab(null)
    setShowCreate(false)
  }

  const navigate = (tab: typeof activeTab, filter?: WorkFilter) => {
    setNotificationsOpen(false)
    if (filter) setWorkFilter(filter)
    if (tab === activeTab) { setShowCreate(false); return }
    setShowCreate(false)
    setActiveTab(tab)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  return (
    <div className="office-root">
      {unlocked ? (
        <div className={`office-shell ${compact ? "office-compact" : ""}`}>
          <nav className="office-side" aria-label="Workspace"><div className="office-brand"><img src={mohLogo} alt="Ministry of Health"/><span>NHIH<small>OPERATIONS OFFICE</small></span></div>{([["Workspace",[[null,"⌂","Overview"],["update","☑","Task directory"],["task","+","Assign task"],["meeting","▦","Meetings"],["activity","◷","Activities"],["action","↳","Action items"]]],["Hub management",[["power","ϟ","Power management"],["visitors","◎","Visitors"],["log","⚑","Incidents"],["emr","▤","EMR programme"]]]] as const).map(([group,items])=><div key={group}><small className="office-group">{group}</small>{items.map(([tab,icon,label])=><button key={label} title={label} aria-current={!notificationsOpen&&activeTab===tab?"page":undefined} onClick={()=>navigate(tab,tab==="update"?"active":undefined)}><i>{icon}</i><span>{label}</span></button>)}</div>)}<div className="office-profile">Operations Manager</div></nav><div className="office-body">
          <header className="operator-bar"><button className="office-toggle" onClick={()=>setCompact(v=>!v)} aria-label="Toggle navigation">☰</button>
            <div className="operator-brand">
              <div><div className="hdr-kicker">NHIH · Operator only</div>
              <strong>Operations Office</strong><small style={{display:'block',fontSize:10,color:'#647180'}}>Signature workspace · R5</small></div>
            </div>
            <div className="operator-bar-actions"><details className="office-install"><summary>Install</summary><InstallApp /></details><button className="ghost-btn" onClick={goDashboard}>Dashboard</button>
              <button type="button" className="ghost-btn" onClick={() => { setShowCreate(false); setNotificationsOpen(v => !v) }}>{notificationsOpen ? "Close notifications" : "Notifications"}</button>
              <button type="button" className="ghost-btn" onClick={signOut}>
                Sign out
              </button>
            </div>
          </header>
          {notificationsOpen ? <NotificationDesk /> : activeTab ? (
            <>
              <button type="button" className="mobile-ops-back" onClick={() => navigate(null)}>← Back to overview</button>
              {activeTab === 'power' ? <PowerDesk/> : activeTab === 'update' ? <><div className="office-work"><MobileWorkQueue key={workFilter} initialFilter={workFilter} onCreate={() => navigate('task')} /></div></> : <AdminPanel key={activeTab} open variant="page" initialTab={activeTab} onClose={goDashboard} />}
            </>
          ) : <MobileOpsHome onOpen={navigate} />}
          </div><nav className="operator-mobile-nav" aria-label="Command Desk navigation">
            <button type="button" className={!activeTab && !showCreate ? 'is-selected' : ''} aria-current={!activeTab && !showCreate ? 'page' : undefined} onClick={() => navigate(null)}><span aria-hidden="true">⌂</span>Home</button>
            <button type="button" className={activeTab === 'update' ? 'is-selected' : ''} aria-current={activeTab === 'update' ? 'page' : undefined} onClick={() => navigate('update')}><span aria-hidden="true">☑</span>Tasks</button>
            <button type="button" className="operator-nav-create" aria-expanded={showCreate} aria-controls="operator-create-menu" onClick={() => setShowCreate(v => !v)}><span aria-hidden="true">＋</span>Create</button>
            <button type="button" className={activeTab === 'meeting' ? 'is-selected' : ''} aria-current={activeTab === 'meeting' ? 'page' : undefined} onClick={() => navigate('meeting')}><span aria-hidden="true">▦</span>Meetings</button>
            <button type="button" className={showCreate || ['activity','action','log','emr','visitors','power'].includes(activeTab ?? '') ? 'is-selected' : ''} aria-expanded={showCreate} aria-controls="operator-create-menu" onClick={() => setShowCreate(v => !v)}><span aria-hidden="true">☰</span>More</button>
          </nav>
          {showCreate && <div className="operator-sheet-backdrop" onClick={() => setShowCreate(false)}>
            <div className="operator-create-sheet" id="operator-create-menu" role="dialog" aria-modal="true" aria-label="Command Desk actions" onClick={e => e.stopPropagation()}>
              <div className="operator-sheet-head"><strong>Quick actions</strong><button type="button" onClick={() => setShowCreate(false)} aria-label="Close actions">✕</button></div>
              <div className="operator-sheet-actions">
                {([['task','＋','Assign task'],['meeting','▦','Add meeting'],['activity','◷','Record activity'],['action','☑','Add follow-up'],['log','⚑','Incident log'],['emr','▤','EMR work'],['visitors','◎','Visitors'],['power','ϟ','Power management']] as const).map(([tab, icon, label]) => <button type="button" key={tab} onClick={() => navigate(tab)}><span aria-hidden="true">{icon}</span>{label}<span aria-hidden="true">›</span></button>)}
              </div>
            </div>
          </div>}
        </div>
      ) : (
        <section className="operator-lock paper">
          <div className="hdr-kicker">Restricted</div>
          <h1>Operator desk</h1>
          <p>
            Prince Mafinda, Operations Manager, enters tasks, meetings, team activities, agenda, minutes, the
            hub incident log, and EMR Launch work here. The dashboard is view-only for everyone else.
          </p>
          <form
            className="admin-form"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              setError('')
              const ok = await unlockOperator(code.trim())
              setBusy(false)
              if (!ok) {
                setError('That access code is not valid.')
                return
              }
              setUnlocked(true)
            }}
          >
            <label>
              Access code
              <input
                type="password"
                autoComplete="current-password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
            {error && <p className="warn-text">{error}</p>}
            <button type="submit" className="primary-btn" disabled={busy}>
              {busy ? 'Checking…' : 'Unlock desk'}
            </button>
          </form>
          <button type="button" className="link-btn" onClick={goDashboard}>
            Back to dashboard
          </button>
        </section>
      )}
    </div>
  )
}
