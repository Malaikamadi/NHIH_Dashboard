import mohsLogo from '../assets/mohs-logo.jpg'
import type { ViewId } from '../types'
import { Icon } from './Icons'

const ITEMS: { id: ViewId; label: string; icon: 'home' | 'chart' | 'users' | 'list' }[] = [
  { id: 'today', label: 'Overview', icon: 'home' },
  { id: 'performance', label: 'Performance', icon: 'chart' },
  { id: 'workload', label: 'Team', icon: 'users' },
  { id: 'actions', label: 'Actions', icon: 'list' },
]

interface Props {
  collapsed: boolean
  active: ViewId
  onSelect: (id: ViewId) => void
  onOpenAdmin: () => void
}

export function SideNav({ collapsed, active, onSelect, onOpenAdmin }: Props) {
  return (
    <aside className={`sidenav ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sidenav-brand">
        <img
          className="sidenav-logo"
          src={mohsLogo}
          alt="Ministry of Health, Government of Sierra Leone"
        />
        {!collapsed && (
          <div>
            <strong>NHIH</strong>
            <span>Team Operations</span>
          </div>
        )}
      </div>

      <nav className="sidenav-nav">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={active === item.id ? 'is-active' : ''}
            onClick={() => onSelect(item.id)}
            title={item.label}
          >
            <Icon name={item.icon} size={18} />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      <button type="button" className="sidenav-desk" onClick={onOpenAdmin} title="Command desk">
        <Icon name="settings" size={18} />
        {!collapsed && <span>Command desk</span>}
      </button>
    </aside>
  )
}
