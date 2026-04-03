import { useState, useEffect } from 'react'
import { Scale, Loader2 } from 'lucide-react'
import { useRouter } from '../router'
import type { PersonConfig, PerfilFrontmatter, CycleReportResult } from '../types/ipc'
import { labelNivel } from '../lib/utils'

// TODO: implementar na Tarefa 2
export function CalibracaoView() {
  return (
    <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
      Calibração — em construção
    </div>
  )
}
