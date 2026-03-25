import type { IngestionAIResult } from '../prompts/ingestion.prompt'
import type { CerimoniaSinalResult } from '../prompts/cerimonia-sinal.prompt'

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
  'sentimento_detectado',
  'nivel_engajamento',
  'confianca',
]

// Fields where null is an explicitly valid value (not treated as missing)
const NULLABLE_FIELDS = new Set<keyof IngestionAIResult>([
  'pessoa_principal',
  'motivo_1on1',
  'motivo_estagnacao',
  'evidencia_evolucao',
])

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
    const value = obj[field]
    const isMissing = value === undefined || (value === null && !NULLABLE_FIELDS.has(field))
    if (isMissing) missingFields.push(field)
  }

  // Type-specific checks
  if (obj.indicador_saude && !['verde', 'amarelo', 'vermelho'].includes(obj.indicador_saude as string)) {
    typeErrors.push(`indicador_saude inválido: "${obj.indicador_saude}"`)
  }

  if (obj.sentimento_detectado && !['positivo', 'neutro', 'ansioso', 'frustrado', 'desengajado'].includes(obj.sentimento_detectado as string)) {
    typeErrors.push(`sentimento_detectado inválido: "${obj.sentimento_detectado}"`)
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
      } else if (!a.descricao || typeof a.descricao !== 'string' || (a.descricao as string).trim() === '') {
        typeErrors.push(`acoes_comprometidas[${i}]: descricao vazia ou inválida`)
      }
    }
  }

  if (obj.nivel_engajamento !== undefined) {
    const n = Number(obj.nivel_engajamento)
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      typeErrors.push(`nivel_engajamento deve ser inteiro de 1 a 5, recebido: "${obj.nivel_engajamento}"`)
    }
  }

  if (obj.confianca !== undefined && !['alta', 'media', 'baixa'].includes(obj.confianca as string)) {
    typeErrors.push(`confianca inválido: "${obj.confianca}" — esperado alta|media|baixa`)
  }

  return {
    valid: missingFields.length === 0 && typeErrors.length === 0,
    missingFields,
    typeErrors,
  }
}

const CERIMONIA_SINAL_REQUIRED_FIELDS: (keyof CerimoniaSinalResult)[] = [
  'sentimento_detectado',
  'nivel_engajamento',
  'indicador_saude',
  'motivo_indicador',
  'soft_skills_observadas',
  'hard_skills_observadas',
  'pontos_de_desenvolvimento',
  'feedbacks_positivos',
  'feedbacks_negativos',
  'temas_detectados',
  'sinal_evolucao',
  'necessita_1on1',
  'confianca',
]

const CERIMONIA_SINAL_NULLABLE_FIELDS = new Set<keyof CerimoniaSinalResult>([
  'evidencia_evolucao',
  'motivo_1on1',
])

export function validateCerimoniaSinalResult(data: unknown): ValidationResult {
  const missingFields: string[] = []
  const typeErrors: string[] = []

  if (!data || typeof data !== 'object') {
    return { valid: false, missingFields: ['(all — not an object)'], typeErrors: [] }
  }

  const obj = data as Record<string, unknown>

  for (const field of CERIMONIA_SINAL_REQUIRED_FIELDS) {
    const value = obj[field]
    const isMissing = value === undefined || (value === null && !CERIMONIA_SINAL_NULLABLE_FIELDS.has(field))
    if (isMissing) missingFields.push(field)
  }

  if (obj.sentimento_detectado && !['positivo', 'neutro', 'ansioso', 'frustrado', 'desengajado'].includes(obj.sentimento_detectado as string)) {
    typeErrors.push(`sentimento_detectado inválido: "${obj.sentimento_detectado}"`)
  }

  if (obj.indicador_saude && !['verde', 'amarelo', 'vermelho'].includes(obj.indicador_saude as string)) {
    typeErrors.push(`indicador_saude inválido: "${obj.indicador_saude}"`)
  }

  if (obj.confianca && !['alta', 'media', 'baixa'].includes(obj.confianca as string)) {
    typeErrors.push(`confianca inválido: "${obj.confianca}"`)
  }

  if (obj.nivel_engajamento !== undefined) {
    const n = Number(obj.nivel_engajamento)
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      typeErrors.push(`nivel_engajamento deve ser inteiro de 1 a 5, recebido: "${obj.nivel_engajamento}"`)
    }
  }

  for (const arr of ['soft_skills_observadas', 'hard_skills_observadas', 'pontos_de_desenvolvimento', 'feedbacks_positivos', 'feedbacks_negativos', 'temas_detectados']) {
    if (obj[arr] !== undefined && !Array.isArray(obj[arr])) {
      typeErrors.push(`${arr} deve ser array`)
    }
  }

  return {
    valid: missingFields.length === 0 && typeErrors.length === 0,
    missingFields,
    typeErrors,
  }
}
