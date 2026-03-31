import { createContext, useContext, useState, type ReactNode } from 'react'

export type ViewName =
  | 'dashboard'
  | 'pares'
  | 'gestores'
  | 'feed'
  | 'person'
  | 'person-form'
  | 'inbox'
  | 'settings'
  | 'eu'
  | 'refinamentos'
  | 'logs'
  | 'reports'

interface RouterEntry {
  view: ViewName
  params: Record<string, string>
}

interface RouterCtx {
  view: ViewName
  params: Record<string, string>
  navigate: (view: ViewName, params?: Record<string, string>) => void
  goBack: () => void
}

const Ctx = createContext<RouterCtx>({} as RouterCtx)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<RouterEntry[]>([
    { view: 'dashboard', params: {} },
  ])

  const current = history[history.length - 1]

  function navigate(view: ViewName, params: Record<string, string> = {}) {
    setHistory((h) => [...h, { view, params }])
  }

  function goBack() {
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h))
  }

  return (
    <Ctx.Provider value={{ view: current.view, params: current.params, navigate, goBack }}>
      {children}
    </Ctx.Provider>
  )
}

export function useRouter() {
  return useContext(Ctx)
}
