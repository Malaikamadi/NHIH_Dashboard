import { useState } from 'react'
import { clearOperatorCode, isOperatorUnlocked } from '../access'
import { unlockOperator } from '../api'
import { AdminPanel } from './AdminPanel'
import { MobileOpsHome } from './MobileOpsHome'

function goDashboard() {
  window.history.pushState({}, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function OperatorDesk() {
  const [unlocked, setUnlocked] = useState(isOperatorUnlocked)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<'task' | 'update' | 'meeting' | 'activity' | 'action' | 'log' | 'emr' | null>(null)

  const signOut = () => {
    clearOperatorCode()
    setUnlocked(false)
    setCode('')
    setError('')
    setActiveTab(null)
  }

  return (
    <div className="operator-page">
      {unlocked ? (
        <>
          <header className="operator-bar">
            <div>
              <div className="hdr-kicker">NHIH · Operator only</div>
              <strong>Operations Control Desk</strong>
            </div>
            <div className="operator-bar-actions">
              <button type="button" className="ghost-btn" onClick={signOut}>
                Sign out
              </button>
            </div>
          </header>
          {activeTab ? (
            <>
              <button type="button" className="mobile-ops-back" onClick={() => { if (window.confirm('Return to overview? Any unsaved changes in this form will be lost.')) setActiveTab(null) }}>← Back to overview</button>
              <AdminPanel key={activeTab} open variant="page" initialTab={activeTab} onClose={goDashboard} />
            </>
          ) : <MobileOpsHome onOpen={setActiveTab} />}
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
