/**
 * PromptConstants — enums e calibrações compartilhadas entre todos os prompts.
 *
 * Centraliza thresholds e regras que antes estavam duplicadas (e inconsistentes)
 * em múltiplos arquivos de prompt.
 */

// ─── Tipos base ──────────────────────────────────────────────────────────────

export type IndicadorSaude = 'verde' | 'amarelo' | 'vermelho'
export type NivelConfianca = 'alta' | 'media' | 'baixa'
export type SentimentoDetectado = 'positivo' | 'neutro' | 'ansioso' | 'frustrado' | 'desengajado'
export type NivelEngajamento = 1 | 2 | 3 | 4 | 5

/** Sentimento com aspecto contextual — substitui o campo string único. */
export interface SentimentoItem {
  valor: SentimentoDetectado
  aspecto: string  // ex: "carreira", "entrega", "relacionamento", "pessoal", "geral"
}

// ─── Calibração de confiança por tipo de artefato ────────────────────────────
// Usa o TIPO do artefato como sinal de qualidade, não o tamanho do texto.

export const CONFIANCA_POR_TIPO: Record<string, NivelConfianca> = {
  '1on1':       'alta',    // estruturado, bilateral, contexto de gestão claro
  'feedback':   'alta',    // avaliação estruturada, fontes identificadas
  'cerimonia':  'media',   // sinal de grupo — participação individual inferida
  'planning':   'media',
  'retro':      'media',
  'daily':      'baixa',   // contexto limitado, participação difusa
  'reuniao':    'baixa',
  'nota':       'baixa',   // texto livre sem estrutura de reunião
}

export function getConfiancaPorTipo(tipo: string): NivelConfianca {
  return CONFIANCA_POR_TIPO[tipo] ?? 'media'
}

// ─── Threshold de necessita_1on1 ─────────────────────────────────────────────
// Definição canônica — usar ESTE texto nos prompts de ingestion e cerimônia.

export const NECESSITA_1ON1_REGRA = `\
"necessita_1on1": true SOMENTE para sinais graves e inequívocos:
  - Conflito interpessoal explícito (não só tensão)
  - Crise declarada (saúde, pessoal, risco de saída)
  - Bloqueio crítico sem resolução há 2+ semanas que impede entregas
Sinais leves (participação abaixo do normal, quietude, frustração pontual) NÃO justificam true — registre esses em pontos_de_atencao ou pontos_de_desenvolvimento.`

// ─── Indicador de saúde — definição canônica ─────────────────────────────────

export const INDICADOR_SAUDE_REGRA = `\
"indicador_saude":
  - "verde": engajamento saudável, sem sinais de alerta
  - "amarelo": sinais de atenção — queda de energia, preocupação, tensão — mas sem crise
  - "vermelho": sinal grave e inequívoco — crise, conflito explícito, desengajamento severo`

// ─── Calibração de tom por tipo de relação ───────────────────────────────────

export const TOM_POR_RELACAO: Record<string, string> = {
  liderado:  'foco em desenvolvimento, accountability e evolução do PDI',
  par:       'foco em colaboração, alinhamento e troca de perspectiva',
  gestor:    'foco em alinhamento estratégico, expectativas e visibilidade para cima',
  cliente:   'foco em entrega, satisfação e gestão de expectativas',
}

export function getTomPorRelacao(relacao: string): string {
  return TOM_POR_RELACAO[relacao] ?? 'foco em desenvolvimento e colaboração'
}

// ─── Calibração de confiança por tipo de artefato (texto para interpolação) ──

export const CONFIANCA_POR_TIPO_TEXTO = `\
Calibre pelo TIPO do artefato, não pelo tamanho do texto:
  - "1on1" ou "feedback": use "alta" (estruturado, bilateral, contexto de gestão claro)
  - "planning" ou "retro": use "media" (sinal de grupo, participação individual inferida)
  - "daily", "reuniao", "cerimonia", "nota": use "baixa" (contexto limitado, participação difusa)
  Exceção: rebaixe um nível quando a transcrição for fragmentada, ambígua ou com evidências contraditórias.
  Quando "baixa": seja conservador — prefira "verde" ou "amarelo" no indicador_saude e evite marcar necessita_1on1: true sem evidência clara.`

// ─── Enums textuais para uso em prompts (interpolação) ───────────────────────

export const SAUDE_ENUM   = '"verde" | "amarelo" | "vermelho"'
export const CONFIANCA_ENUM = '"alta" | "media" | "baixa"'
export const SENTIMENTO_ENUM = '"positivo" | "neutro" | "ansioso" | "frustrado" | "desengajado"'
export const ENGAJAMENTO_ENUM = '1 (muito baixo) a 5 (muito alto)'
