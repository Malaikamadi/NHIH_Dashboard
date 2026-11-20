import { useState } from 'react'
import { clearOperatorCode, isOperatorUnlocked } from '../access'
import { unlockOperator } from '../api'
import { AdminPanel } from './AdminPanel'
import { MobileOpsHome } from './MobileOpsHome'
import { MobileWorkQueue, type WorkFilter } from './MobileWorkQueue'
import mohLogo from '../assets/mohs-logo.jpg'
import { InstallApp } from './InstallApp'

function goDashboard() {
  window.history.pushState({}, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function OperatorDesk() {
  const [unlocked, setUnlocked] = useState(isOperatorUnlocked)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [workFilter, setWorkFilter] = useState<WorkFilter>('active')
  const [activeTab, setActiveTab] = useState<'task' | 'update' | 'meeting' | 'activity' | 'action' | 'log' | 'emr' | null>(null)

  const signOut = () => {
    clearOperatorCode()
    setUnlocked(false)
    setCode('')
    setError('')
    setActiveTab(null)
    setShowCreate(false)
  }

  const navigate = (tab: typeof activeTab, filter?: WorkFilter) => {
    if (filter) setWorkFilter(filter)
    if (tab === activeTab) { setShowCreate(false); return }
    if (activeTab && !window.confirm('Leave this screen? Any unsaved form changes will be lost.')) return
    setShowCreate(false)
    setActiveTab(tab)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  return (
    <div className="operator-page">
      <InstallApp />
      {unlocked ? (
        <>
          <header className="operator-bar">
            <div className="operator-brand"><img src={mohLogo} alt="Ministry of Health logo" />
              <div><div className="hdr-kicker">NHIH · Operator only</div>
              <strong>Operations Control Desk</strong></div>
            </div>
            <div className="operator-bar-actions">
              <button type="button" className="ghost-btn" onClick={signOut}>
                Sign out
              </button>
            </div>
          </header>
          {activeTab ? (
            <>
              <button type="button" className="mobile-ops-back" onClick={() => navigate(null)}>← Back to overview</button>
              {activeTab === 'update' ? <><div className="operator-mobile-work"><MobileWorkQueue key={workFilter} initialFilter={workFilter} onCreate={() => navigate('task')} /></div><div className="operator-desktop-work"><AdminPanel key={activeTab} open variant="page" initialTab={activeTab} onClose={goDashboard} /></div></> : <AdminPanel key={activeTab} open variant="page" initialTab={activeTab} onClose={goDashboard} />}
            </>
          ) : <MobileOpsHome onOpen={navigate} />}
          <nav className="operator-mobile-nav" aria-label="Command Desk navigation">
            <button type="button" className={!activeTab && !showCreate ? 'is-selected' : ''} aria-current={!activeTab && !showCreate ? 'page' : undefined} onClick={() => navigate(null)}><span aria-hidden="true">⌂</span>Home</button>
            <button type="button" className={activeTab === 'update' ? 'is-selected' : ''} aria-current={activeTab === 'update' ? 'page' : undefined} onClick={() => navigate('update')}><span aria-hidden="true">☑</span>Tasks</button>
            <button type="button" className="operator-nav-create" aria-expanded={showCreate} aria-controls="operator-create-menu" onClick={() => setShowCreate(v => !v)}><span aria-hidden="true">＋</span>Create</button>
            <button type="button" className={activeTab === 'meeting' ? 'is-selected' : ''} aria-current={activeTab === 'meeting' ? 'page' : undefined} onClick={() => navigate('meeting')}><span aria-hidden="true">▦</span>Meetings</button>
            <button type="button" className={showCreate || ['activity','action','log','emr'].includes(activeTab ?? '') ? 'is-selected' : ''} aria-expanded={showCreate} aria-controls="operator-create-menu" onClick={() => setShowCreate(v => !v)}><span aria-hidden="true">☰</span>More</button>
          </nav>
          {showCreate && <div className="operator-sheet-backdrop" onClick={() => setShowCreate(false)}>
            <div className="operator-create-sheet" id="operator-create-menu" role="dialog" aria-modal="true" aria-label="Command Desk actions" onClick={e => e.stopPropagation()}>
              <div className="operator-sheet-head"><strong>Quick actions</strong><button type="button" onClick={() => setShowCreate(false)} aria-label="Close actions">✕</button></div>
              <div className="operator-sheet-actions">
                {([['task','＋','Assign task'],['meeting','▦','Add meeting'],['activity','◷','Record activity'],['action','☑','Add follow-up'],['log','⚑','Incident log'],['emr','▤','EMR work']] as const).map(([tab, icon, label]) => <button type="button" key={tab} onClick={() => navigate(tab)}><span aria-hidden="true">{icon}</span>{label}<span aria-hidden="true">›</span></button>)}
              </div>
            </div>
          </div>}
        </>
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
