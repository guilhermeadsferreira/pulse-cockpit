import { useState, useEffect } from 'react'
import { Grid2X2, Inbox, Settings, Users, UserCheck, ScrollText, User, BookOpen, Terminal, BarChart3, ShieldCheck } from 'lucide-react'
import { useRouter, type ViewName } from '../router'
import type { Demanda } from '../types/ipc'

interface NavItem {
  id: ViewName
  label: string
  icon: React.ReactNode
  badge?: number
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase() || '?'
}

export function Sidebar() {
  const { view, navigate } = useRouter()
  const [profile, setProfile]               = useState<{ name: string; role: string }>({ name: '', role: '' })
  const [openDemandasCount, setOpenDemandas] = useState(0)

  useEffect(() => {
    function loadProfile() {
      window.api.settings.load().then((s) => {
        setProfile({ name: s.managerName ?? '', role: s.managerRole ?? '' })
      })
    }
    loadProfile()
    window.addEventListener('settings:saved', loadProfile)
    return () => window.removeEventListener('settings:saved', loadProfile)
  }, [])

  useEffect(() => {
    async function loadDemandas() {
      try {
        const list = await window.api.eu.listDemandas() as Demanda[]
        setOpenDemandas(list.filter((d) => d.status === 'open').length)
      } catch { /* workspace may not be ready yet */ }
    }
    loadDemandas()
    window.addEventListener('demandas:changed', loadDemandas)
    return () => window.removeEventListener('demandas:changed', loadDemandas)
  }, [])

  const navItems: NavItem[] = [
    { id: 'inbox',     label: 'Inbox',    icon: <Inbox size={14} /> },
    { id: 'dashboard', label: 'Time',     icon: <Grid2X2 size={14} /> },
    { id: 'pares',     label: 'Pares',    icon: <Users size={14} /> },
    { id: 'gestores',  label: 'Gestores', icon: <UserCheck size={14} /> },
    { id: 'feed',      label: 'Reuniões', icon: <ScrollText size={14} /> },
    { id: 'eu',           label: 'Eu',           icon: <User size={14} />, badge: openDemandasCount > 0 ? openDemandasCount : undefined },
    { id: 'reports',      label: 'Relatórios',   icon: <BarChart3 size={14} /> },
    { id: 'refinamentos', label: 'Refinamentos', icon: <BookOpen size={14} /> },
    { id: 'audit',        label: 'Auditoria',     icon: <ShieldCheck size={14} /> },
    { id: 'logs',         label: 'Logs',          icon: <Terminal size={14} /> },
  ]

  const displayName = profile.name || 'Configurar perfil'
  const initials = getInitials(profile.name)

  return (
    <nav style={{
      width: 224,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'fixed',
      top: 0, left: 0,
      height: '100vh',
      zIndex: 100,
    }}>
      {/* macOS traffic light spacer */}
      <div className="drag-region" style={{ height: 44, flexShrink: 0 }} />

      {/* Logo */}
      <div style={{
        padding: '0 18px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>
          Pulse Cockpit
        </span>
        <span style={{
          width: 5, height: 5,
          borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 0 6px var(--accent), 0 0 12px var(--accent-glow)',
          flexShrink: 0,
          marginBottom: 1,
        }} />
      </div>

      {/* Nav */}
      <div style={{
        flex: 1,
        padding: '10px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        overflowY: 'auto',
      }}>
        {navItems.map((item) => (
          <NavBtn key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} />
        ))}
      </div>

      {/* Footer — gestor + gear */}
      <div style={{ padding: '8px', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '6px 10px',
          borderRadius: 'var(--r)',
        }}>
          <div style={{
            width: 30, height: 30,
            borderRadius: '50%',
            background: 'var(--accent-dim)',
            border: '1px solid rgba(192,135,58,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: '0.02em',
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 12.5, fontWeight: 600, lineHeight: 1.3,
              color: profile.name ? 'var(--text-primary)' : 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {displayName}
            </div>
            {profile.role && (
              <div style={{
                fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {profile.role}
              </div>
            )}
          </div>
          <button
            onClick={() => navigate('settings')}
            title="Settings"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6,
              background: view === 'settings' ? 'var(--surface-3)' : 'transparent',
              border: 'none', cursor: 'pointer', flexShrink: 0,
              color: view === 'settings' ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              if (view !== 'settings') e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              if (view !== 'settings') e.currentTarget.style.color = 'var(--text-muted)'
            }}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
    </nav>
  )
}

function NavBtn({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        borderRadius: 'var(--r)',
        background: active ? 'var(--surface-3)' : 'transparent',
        border: 'none',
        outline: 'none',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 13, fontWeight: active ? 500 : 400,
        cursor: 'pointer',
        width: '100%', textAlign: 'left',
        transition: 'background 0.12s, color 0.12s, box-shadow 0.12s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--surface-2)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-secondary)'
        }
      }}
    >
      <span style={{
        opacity: active ? 1 : 0.5,
        display: 'flex', alignItems: 'center',
        transition: 'opacity 0.12s',
        color: active ? 'var(--accent)' : 'currentColor',
      }}>
        {item.icon}
      </span>
      {item.label}
      {item.badge !== undefined && (
        <span style={{
          marginLeft: 'auto',
          background: 'var(--red-dim)',
          border: '1px solid rgba(184,64,64,0.25)',
          color: 'var(--red)',
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5, padding: '1px 6px', borderRadius: 20,
          fontWeight: 500,
        }}>
          {item.badge}
        </span>
      )}
    </button>
  )
}

