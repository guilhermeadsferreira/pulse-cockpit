import type { IngestionAIResult } from '../prompts/ingestion.prompt'

const REQUIRED_FIELDS: (keyof IngestionAIResult)[] = [
  'tipo',
  'data_artefato',
  'pessoas_identificadas',
  'novas_pessoas_detectadas',
  'pessoa_principal',
  'resumo',
  'acoes_comprometidas',
  'pontos_de_atencao',
  'elogios_e_conquistas',
  'temas_detectados',
  'resumo_evolutivo',
  'temas_atualizados',
  'indicador_saude',
  'motivo_indicador',
  'necessita_1on1',
  'alerta_estagnacao',
  'sinal_evolucao',
]

export interface ValidationResult {
  valid: boolean
  missingFields: string[]
  typeErrors: string[]
}

export function validateIngestionResult(data: unknown): ValidationResult {
  const missingFields: string[] = []
  const typeErrors: string[] = []

  if (!data || typeof data !== 'object') {
    return { valid: false, missingFields: ['(all — not an object)'], typeErrors: [] }
  }

  const obj = data as Record<string, unknown>

  for (const field of REQUIRED_FIELDS) {
    if (obj[field] === undefined || obj[field] === null) {
      missingFields.push(field)
    }
  }

  // Type-specific checks
  if (obj.indicador_saude && !['verde', 'amarelo', 'vermelho'].includes(obj.indicador_saude as string)) {
    typeErrors.push(`indicador_saude inválido: "${obj.indicador_saude}"`)
  }

  if (obj.tipo && !['1on1', 'reuniao', 'daily', 'planning', 'retro', 'feedback', 'outro'].includes(obj.tipo as string)) {
    typeErrors.push(`tipo inválido: "${obj.tipo}"`)
  }

  if (obj.acoes_comprometidas !== undefined && !Array.isArray(obj.acoes_comprometidas)) {
    typeErrors.push('acoes_comprometidas deve ser array')
  } else if (Array.isArray(obj.acoes_comprometidas)) {
    for (let i = 0; i < obj.acoes_comprometidas.length; i++) {
      const a = obj.acoes_comprometidas[i]
      if (!a || typeof a !== 'object' || !('responsavel' in a) || !('descricao' in a)) {
        typeErrors.push(`acoes_comprometidas[${i}]: faltando responsavel ou descricao`)
      }
    }
  }

  if (obj.nivel_engajamento !== undefined) {
    const n = Number(obj.nivel_engajamento)
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      typeErrors.push(`nivel_engajamento deve ser inteiro de 1 a 5, recebido: "${obj.nivel_engajamento}"`)
    }
  }

  return {
    valid: missingFields.length === 0 && typeErrors.length === 0,
    missingFields,
    typeErrors,
  }
}
