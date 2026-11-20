export type InstallPrompt = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const appInstall = {
  prompt: null as InstallPrompt | null,
  worker: 'Checking app connection…',
}

function changed() { window.dispatchEvent(new Event('nhih-install-status')) }

export function setupDeskPwa() {
  if (window.location.pathname.replace(/\/+$/, '') !== '/desk') return
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    appInstall.prompt = event as InstallPrompt
    changed()
  })
  window.addEventListener('appinstalled', () => {
    appInstall.prompt = null
    appInstall.worker = 'Chrome reported an install event. Confirm NHIH Command appears in Samsung Settings → Apps; Android installation can still fail.'
    changed()
  })
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]') || document.createElement('link')
  link.rel = 'manifest'
  link.href = '/desk-manifest.webmanifest?v=4'
  document.head.appendChild(link)
  const theme = document.querySelector('meta[name="theme-color"]') || document.createElement('meta')
  theme.setAttribute('name', 'theme-color')
  theme.setAttribute('content', '#1f4e79')
  if (!theme.parentElement) document.head.appendChild(theme)
  if ('serviceWorker' in navigator) {
    const register = () => {
      void navigator.serviceWorker.register('/desk-sw.js', { scope: '/desk' }).then(() => navigator.serviceWorker.ready).then(() => {
        appInstall.worker = 'App connection ready. Waiting for Chrome to offer installation.'
        changed()
      }).catch((error: unknown) => {
        appInstall.worker = `App connection failed: ${error instanceof Error ? error.message : String(error)}`
        changed()
        console.error('NHIH app service worker registration failed', error)
      })
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  } else {
    appInstall.worker = 'This browser does not support the app connection. Open this page in Chrome.'
  }
}
