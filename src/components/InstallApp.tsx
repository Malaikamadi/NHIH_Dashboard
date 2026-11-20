import { useEffect, useState } from 'react'
import { appInstall } from '../desk-pwa'

export function InstallApp() {
  const [, refresh] = useState(0)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const update = () => refresh(v => v + 1)
    window.addEventListener('nhih-install-status', update)
    return () => window.removeEventListener('nhih-install-status', update)
  }, [])
  if (window.matchMedia('(display-mode: standalone)').matches) return null
  return <aside className="paper" style={{ margin: '12px', padding: '16px' }} aria-label="Install NHIH app">
    <strong>NHIH Command app</strong>
    <p role="status" style={{ margin: '8px 0', fontSize: '14px', overflowWrap: 'anywhere' }}>
      {message || (appInstall.prompt ? 'Ready to install as an app.' : appInstall.worker)}
    </p>
    <button type="button" className="primary-btn" disabled={busy || !appInstall.prompt} onClick={async () => {
      const prompt = appInstall.prompt
      if (!prompt) return
      setBusy(true)
      try {
        await prompt.prompt()
        const choice = await prompt.userChoice
        appInstall.prompt = null
        setMessage(choice.outcome === 'accepted' ? 'Installation requested. Follow Chrome’s installation progress.' : 'Installation dismissed. Reload this page to try again.')
      } catch (error) {
        setMessage(`Installation failed: ${error instanceof Error ? error.message : String(error)}`)
      } finally { setBusy(false) }
    }}>{busy ? 'Opening installer…' : 'Install app'}</button>
  </aside>
}
