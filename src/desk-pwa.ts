export function setupDeskPwa() {
  if (window.location.pathname.replace(/\/+$/, '') !== '/desk') return
  const link = document.createElement('link')
  link.rel = 'manifest'
  link.href = '/desk-manifest.webmanifest'
  document.head.appendChild(link)
  const theme = document.querySelector('meta[name="theme-color"]') || document.createElement('meta')
  theme.setAttribute('name', 'theme-color')
  theme.setAttribute('content', '#1f4e79')
  if (!theme.parentElement) document.head.appendChild(theme)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/desk-sw.js', { scope: '/desk' }).catch(() => {})
    })
  }
}
