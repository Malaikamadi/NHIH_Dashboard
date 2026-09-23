import { useState } from 'react'
import { clearOperatorCode, isOperatorUnlocked } from '../access'
import { unlockOperator } from '../api'
import { AdminPanel } from './AdminPanel'

function goDashboard() {
  window.history.pushState({}, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function OperatorDesk() {
  const [unlocked, setUnlocked] = useState(isOperatorUnlocked)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const signOut = () => {
    clearOperatorCode()
    setUnlocked(false)
    setCode('')
    setError('')
  }

  return (
    <div className="operator-page">
      {unlocked ? (
        <>
          <header className="operator-bar">
            <div>
              <div className="hdr-kicker">NHIH hub</div>
              <strong>Operator desk · Prince Mafinda</strong>
            </div>
            <div className="operator-bar-actions">
              <button type="button" className="ghost-btn" onClick={signOut}>
                Sign out
              </button>
            </div>
          </header>
          <AdminPanel open variant="page" onClose={goDashboard} />
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
