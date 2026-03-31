import { useEffect, Component, type ReactNode, type ErrorInfo } from 'react'
import { RouterProvider, useRouter } from './router'
import { Layout } from './components/Layout'
import { DashboardView }    from './views/DashboardView'
import { PersonView }       from './views/PersonView'
import { PersonFormView }   from './views/PersonFormView'
import { SettingsView }     from './views/SettingsView'
import { InboxView }        from './views/InboxView'
import { MeetingsFeedView } from './views/MeetingsFeedView'
import { EuView }             from './views/EuView'
import { RefinamentosView }   from './views/RefinamentosView'
import LogsView               from './views/LogsView'
import { RelatoriosView }     from './views/RelatoriosView'
import { AuditView }          from './views/AuditView'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    window.api.logs.write('error', 'ErrorBoundary', error.message, { stack: error.stack, componentStack: info.componentStack })
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '40px', display: 'flex', flexDirection: 'column', gap: 12,
          color: 'var(--text-primary)', fontFamily: 'var(--font)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)' }}>Erro de renderização</div>
          <pre style={{
            fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, padding: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 6,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function AppContent() {
  const { view } = useRouter()

  const content = {
    'dashboard':    <DashboardView relacao="liderado" />,
    'pares':        <DashboardView relacao="par" />,
    'gestores':     <DashboardView relacao="gestor" />,
    'person':       <PersonView />,
    'person-form':  <PersonFormView />,
    'settings':     <SettingsView />,
    'inbox':        <InboxView />,
    'feed':         <MeetingsFeedView />,
    'eu':           <EuView />,
    'refinamentos': <RefinamentosView />,
    'logs':          <LogsView />,
    'reports':       <RelatoriosView />,
    'audit':         <AuditView />,
  }[view] ?? <DashboardView relacao="liderado" />

  return <Layout>{content}</Layout>
}

export function App() {
  // Prevent Electron from navigating when a file is dropped outside the drop zone
  useEffect(() => {
    function prevent(e: DragEvent) { e.preventDefault() }
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', prevent)
    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', prevent)
    }
  }, [])

  return (
    <RouterProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </RouterProvider>
  )
}
