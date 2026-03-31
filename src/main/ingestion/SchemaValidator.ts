import type { IngestionAIResult } from '../prompts/ingestion.prompt'
import type { CerimoniaSinalResult } from '../prompts/cerimonia-sinal.prompt'
import type { OneOnOneResult } from '../prompts/1on1-deep.prompt'

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
  'sentimentos',
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

  // sentimentos: array of {valor, aspecto} objects
  if (obj.sentimentos !== undefined) {
    if (!Array.isArray(obj.sentimentos)) {
      typeErrors.push('sentimentos deve ser array')
    } else {
      const validValores = ['positivo', 'neutro', 'ansioso', 'frustrado', 'desengajado']
      for (let i = 0; i < (obj.sentimentos as unknown[]).length; i++) {
        const s = (obj.sentimentos as Record<string, unknown>[])[i]
        if (!s || typeof s !== 'object' || !('valor' in s) || !('aspecto' in s)) {
          typeErrors.push(`sentimentos[${i}]: faltando valor ou aspecto`)
        } else if (!validValores.includes(s.valor as string)) {
          typeErrors.push(`sentimentos[${i}].valor inválido: "${s.valor}"`)
        }
      }
    }
  }
  // pontos_de_atencao: each item must be {texto, frequencia}
  if (Array.isArray(obj.pontos_de_atencao)) {
    for (let i = 0; i < (obj.pontos_de_atencao as unknown[]).length; i++) {
      const p = (obj.pontos_de_atencao as Record<string, unknown>[])[i]
      if (typeof p === 'string') continue  // legacy string format — tolerate
      if (!p || typeof p !== 'object' || !('texto' in p) || !('frequencia' in p)) {
        typeErrors.push(`pontos_de_atencao[${i}]: faltando texto ou frequencia`)
      } else if (!['primeira_vez', 'recorrente'].includes(p.frequencia as string)) {
        typeErrors.push(`pontos_de_atencao[${i}].frequencia inválido: "${p.frequencia}"`)
      }
    }
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
  'sentimentos',
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
  'resumo_evolutivo',
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

  // sentimentos: array of {valor, aspecto}
  if (obj.sentimentos !== undefined) {
    if (!Array.isArray(obj.sentimentos)) {
      typeErrors.push('sentimentos deve ser array')
    } else {
      const validValores = ['positivo', 'neutro', 'ansioso', 'frustrado', 'desengajado']
      for (let i = 0; i < (obj.sentimentos as unknown[]).length; i++) {
        const s = (obj.sentimentos as Record<string, unknown>[])[i]
        if (!s || typeof s !== 'object' || !('valor' in s) || !('aspecto' in s)) {
          typeErrors.push(`sentimentos[${i}]: faltando valor ou aspecto`)
        } else if (!validValores.includes(s.valor as string)) {
          typeErrors.push(`sentimentos[${i}].valor inválido: "${s.valor}"`)
        }
      }
    }
  }

  if (obj.indicador_saude && !['verde', 'amarelo', 'vermelho'].includes(obj.indicador_saude as string)) {
    typeErrors.push(`indicador_saude inválido: "${obj.indicador_saude}"`)
  }

  if (obj.confianca !== undefined && !['alta', 'media', 'baixa'].includes(obj.confianca as string)) {
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

// --- OneOnOneResult validation ---

const ONE_ON_ONE_REQUIRED_FIELDS: (keyof OneOnOneResult)[] = [
  'followup_acoes',
  'acoes_liderado',
  'acoes_gestor',
  'insights_1on1',
  'sugestoes_gestor',
  'correlacoes_terceiros',
  'tendencia_emocional',
  'nota_tendencia',
  'pdi_update',
  'resumo_executivo_rh',
]

export function validateOneOnOneResult(data: unknown): ValidationResult {
  const missingFields: string[] = []
  const typeErrors: string[] = []

  if (!data || typeof data !== 'object') {
    return { valid: false, missingFields: ['(all — not an object)'], typeErrors: [] }
  }

  const obj = data as Record<string, unknown>

  for (const field of ONE_ON_ONE_REQUIRED_FIELDS) {
    if (obj[field] === undefined || obj[field] === null) {
      missingFields.push(field)
    }
  }

  // Array fields
  for (const arr of ['followup_acoes', 'acoes_liderado', 'acoes_gestor', 'insights_1on1', 'sugestoes_gestor', 'correlacoes_terceiros']) {
    if (obj[arr] !== undefined && !Array.isArray(obj[arr])) {
      typeErrors.push(`${arr} deve ser array`)
    }
  }

  // Enum: tendencia_emocional
  if (obj.tendencia_emocional && !['estavel', 'melhorando', 'deteriorando', 'novo_sinal'].includes(obj.tendencia_emocional as string)) {
    typeErrors.push(`tendencia_emocional inválido: "${obj.tendencia_emocional}"`)
  }

  // pdi_update must be object
  if (obj.pdi_update !== undefined && (typeof obj.pdi_update !== 'object' || obj.pdi_update === null)) {
    typeErrors.push('pdi_update deve ser objeto')
  }

  // resumo_executivo_rh must be string
  if (obj.resumo_executivo_rh !== undefined && typeof obj.resumo_executivo_rh !== 'string') {
    typeErrors.push('resumo_executivo_rh deve ser string')
  }

  // Validate followup_acoes items
  if (Array.isArray(obj.followup_acoes)) {
    for (let i = 0; i < (obj.followup_acoes as unknown[]).length; i++) {
      const f = (obj.followup_acoes as Record<string, unknown>[])[i]
      if (!f || typeof f !== 'object') {
        typeErrors.push(`followup_acoes[${i}]: não é objeto`)
      } else if (!f.status || !['cumprida', 'em_andamento', 'nao_mencionada', 'abandonada'].includes(f.status as string)) {
        typeErrors.push(`followup_acoes[${i}].status inválido: "${f.status}"`)
      }
    }
  }

  // Validate acoes_liderado items
  if (Array.isArray(obj.acoes_liderado)) {
    for (let i = 0; i < (obj.acoes_liderado as unknown[]).length; i++) {
      const a = (obj.acoes_liderado as Record<string, unknown>[])[i]
      if (!a || typeof a !== 'object') {
        typeErrors.push(`acoes_liderado[${i}]: não é objeto`)
      } else {
        if (!a.descricao || typeof a.descricao !== 'string' || (a.descricao as string).trim() === '') {
          typeErrors.push(`acoes_liderado[${i}]: descricao vazia ou inválida`)
        }
        if (a.tipo && !['tarefa_explicita', 'compromisso_informal', 'mudanca_processo', 'pdi'].includes(a.tipo as string)) {
          typeErrors.push(`acoes_liderado[${i}].tipo inválido: "${a.tipo}"`)
        }
      }
    }
  }

  // Validate insights_1on1 items
  if (Array.isArray(obj.insights_1on1)) {
    const validCategorias = ['carreira', 'pdi', 'expectativas', 'feedback_dado', 'feedback_recebido', 'relacionamento', 'pessoal', 'processo']
    for (let i = 0; i < (obj.insights_1on1 as unknown[]).length; i++) {
      const ins = (obj.insights_1on1 as Record<string, unknown>[])[i]
      if (!ins || typeof ins !== 'object') {
        typeErrors.push(`insights_1on1[${i}]: não é objeto`)
      } else if (ins.categoria && !validCategorias.includes(ins.categoria as string)) {
        typeErrors.push(`insights_1on1[${i}].categoria inválido: "${ins.categoria}"`)
      }
    }
  }

  return {
    valid: missingFields.length === 0 && typeErrors.length === 0,
    missingFields,
    typeErrors,
  }
}
