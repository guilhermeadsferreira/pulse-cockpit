import { type ReactNode, useState, useEffect } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { Sidebar } from './Sidebar'

function UpdateBanner({ update }: { update: UpdateStatus }) {
  if (update.phase === 'available') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 16px',
        background: 'rgba(60,130,246,0.1)',
        borderBottom: '1px solid rgba(60,130,246,0.25)',
        fontSize: 12, color: 'var(--text-secondary)',
      }}>
        <Download size={13} style={{ color: 'var(--blue, #3c82f6)', flexShrink: 0 }} />
        <span>
          Nova versão {update.version} encontrada — baixando em segundo plano…
        </span>
      </div>
    )
  }

  if (update.phase === 'downloading') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 16px',
        background: 'rgba(60,130,246,0.1)',
        borderBottom: '1px solid rgba(60,130,246,0.25)',
        fontSize: 12, color: 'var(--text-secondary)',
      }}>
        <Download size={13} style={{ color: 'var(--blue, #3c82f6)', flexShrink: 0 }} />
        <span>Baixando atualização… {update.progress}%</span>
        <div style={{
          flex: 1, height: 3, background: 'var(--surface-3)',
          borderRadius: 2, overflow: 'hidden', maxWidth: 120,
        }}>
          <div style={{
            height: '100%', width: `${update.progress}%`,
            background: 'var(--blue, #3c82f6)',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
    )
  }

  if (update.phase === 'ready') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 16px',
        background: 'rgba(60,200,100,0.08)',
        borderBottom: '1px solid rgba(60,200,100,0.25)',
        fontSize: 12, color: 'var(--text-secondary)',
      }}>
        <RefreshCw size={13} style={{ color: 'var(--green)', flexShrink: 0 }} />
        <span>Versão {update.version} pronta.</span>
        <button
          onClick={() => window.api.update.install()}
          style={{
            marginLeft: 4,
            padding: '2px 10px',
            background: 'var(--green)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reiniciar agora
        </button>
      </div>
    )
  }

  return null
}

export function Layout({ children }: { children: ReactNode }) {
  const [update, setUpdate] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    window.api.update.onStatus((data) => setUpdate(data))
    return () => window.api.update.removeListeners()
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        marginLeft: 224,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {update && <UpdateBanner update={update} />}
        {children}
      </main>
    </div>
  )
}
