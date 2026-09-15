import { useEffect, useRef, useState } from 'react'
import { Header } from './components/Header'
import { OperatorDesk } from './components/OperatorDesk'
import { SideNav } from './components/SideNav'
import { ViewChrome } from './components/ViewChrome'
import { OpsProvider } from './store/OpsContext'
import type { ViewId } from './types'
import { ActionItemsView } from './views/ActionItemsView'
import { PerformanceView } from './views/PerformanceView'
import { TodayOpsView } from './views/TodayOpsView'
import { WorkloadView } from './views/WorkloadView'

const VIEW_ORDER: ViewId[] = ['today', 'performance', 'workload', 'actions']
const ROTATE_MS = 25000

function isDeskPath(): boolean {
  return window.location.pathname.replace(/\/+$/, '') === '/desk'
}

function initialView(): ViewId {
  const value = new URLSearchParams(window.location.search).get('view')
  return VIEW_ORDER.includes(value as ViewId) ? (value as ViewId) : 'today'
}

function Board() {
  const params = new URLSearchParams(window.location.search)
  const [view, setView] = useState<ViewId>(initialView)
  const [paused, setPaused] = useState(() => params.get('rotate') !== '1')
  const [progress, setProgress] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('theme')
    if (fromUrl === 'dark' || fromUrl === 'light') return fromUrl
    const saved = localStorage.getItem('nhih-theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [fade, setFade] = useState(false)
  const started = useRef(Date.now())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('nhih-theme', theme)
  }, [theme])

  const selectView = (id: ViewId) => {
    if (id === view) {
      started.current = Date.now()
      setProgress(0)
      return
    }
    setFade(true)
    window.setTimeout(() => {
      setView(id)
      started.current = Date.now()
      setProgress(0)
      setFade(false)
    }, 220)
  }

  useEffect(() => {
    if (paused) return
    const id = window.setInterval(() => {
      const p = (Date.now() - started.current) / ROTATE_MS
      if (p >= 1) {
        const idx = VIEW_ORDER.indexOf(view)
        selectView(VIEW_ORDER[(idx + 1) % VIEW_ORDER.length])
      } else {
        setProgress(p)
      }
    }, 80)
    return () => window.clearInterval(id)
  }, [paused, view])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        setPaused((p) => !p)
      }
      if (event.key >= '1' && event.key <= '4') {
        selectView(VIEW_ORDER[Number(event.key) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''}`}>
      <SideNav collapsed={collapsed} active={view} onSelect={selectView} />
      <div className="workspace">
        <Header
          onMenu={() => setCollapsed((v) => !v)}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        />
        <main className={`stage ${fade ? 'is-fade' : ''}`}>
          {view === 'today' && <TodayOpsView onOpenView={selectView} />}
          {view === 'performance' && <PerformanceView />}
          {view === 'workload' && <WorkloadView />}
          {view === 'actions' && <ActionItemsView />}
        </main>
        <ViewChrome
          progress={progress}
          paused={paused}
          onTogglePause={() => setPaused((p) => !p)}
        />
      </div>
    </div>
  )
}

export default function App() {
  const [desk, setDesk] = useState(isDeskPath)

  useEffect(() => {
    const onPop = () => setDesk(isDeskPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return (
    <OpsProvider>
      {desk ? <OperatorDesk /> : <Board />}
    </OpsProvider>
  )
}
