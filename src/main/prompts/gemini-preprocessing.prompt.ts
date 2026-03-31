export interface GeminiPreprocessingResult {
  /** Texto limpo e estruturado */
  texto_limpo: string
  /** Metadados extraídos */
  metadados: {
    data_reuniao?: string
    participantes: string[]
    duracao_minutos?: number
    speaker_confidence: 'alta' | 'media' | 'baixa'  // confiança na atribuição de fala
  }
  /** Estatísticas do processamento */
  estatisticas: {
    tokens_removidos: number
    percentual_economia: number
  }
}

/**
 * Modo de pré-processamento:
 * - 'light': para 1:1s — remove apenas ruído técnico, preserva fluxo conversacional e tom emocional
 * - 'full':  para reuniões coletivas — limpeza + reestruturação por temas
 */
export type GeminiPreprocessingMode = 'light' | 'full'

/**
 * Detecta o modo de pré-processamento adequado.
 * Prioridade: análise de conteúdo (quando disponível) > nome do arquivo.
 *
 * Análise de conteúdo: conta speakers distintos nas primeiras 500 chars.
 * - 1-2 speakers → 'light' (1:1 ou conversa bilateral)
 * - 3+ speakers → 'full' (cerimônia coletiva)
 */
export function detectPreprocessingMode(
  fileName: string,
  contentPreview?: string,
): GeminiPreprocessingMode {
  // Análise de conteúdo tem prioridade se disponível
  if (contentPreview) {
    const preview = contentPreview.slice(0, 500)
    // Conta speakers distintos: padrões como "Nome:", "Speaker 1:", "[Nome]"
    const speakerMatches = preview.match(/^[A-ZÀ-Ú][a-zA-ZÀ-ú\s]{1,30}:/gm) || []
    const uniqueSpeakers = new Set(speakerMatches.map(s => s.trim().toLowerCase()))
    if (uniqueSpeakers.size >= 3) return 'full'
    if (uniqueSpeakers.size <= 2 && uniqueSpeakers.size > 0) return 'light'
    // Se não detectou speakers pelo padrão, cai para análise por filename
  }

  // Fallback: análise por nome de arquivo (comportamento original)
  const lower = fileName.toLowerCase()
  if (
    lower.includes('1on1') ||
    lower.includes('1-on-1') ||
    lower.includes('one-on-one') ||
    lower.includes('one on one') ||
    /\b1[_\s]?:\s?1\b/.test(lower)
  ) {
    return 'light'
  }
  return 'full'
}

export function buildGeminiPreprocessingPrompt(
  rawTranscript: string,
  mode: GeminiPreprocessingMode = 'full',
): string {
  return mode === 'light'
    ? buildLightPrompt(rawTranscript)
    : buildFullPrompt(rawTranscript)
}

// ─── Modo LIGHT — para 1:1s ──────────────────────────────────────────────────
// Objetivo: remover apenas ruído técnico de transcrição automática.
// Preservar: fluxo cronológico, tom emocional, dinâmica gestor↔liderado,
// conteúdo pessoal relevante para saúde, hesitações e nuances.

function buildLightPrompt(rawTranscript: string): string {
  return `Você é um assistente especializado em limpar transcrições automáticas de 1:1s entre gestores e liderados.

SUA TAREFA: Remover APENAS ruído técnico da transcrição, preservando integralmente o conteúdo, tom e dinâmica da conversa.

## REGRAS ABSOLUTAS:

### 1. REMOVER (ruído técnico puro — nada além disso):
- Preenchedores sem conteúdo: "né", "tipo", "entendeu", "sabe", "assim", "ó", "aí", "tipo assim", "tá", "então"
- Interjeições isoladas: "ah", "eh", "hum", "hmmm", "poxa", "cara" (apenas quando sozinhas, sem informação)
- Sons transcritos: [risos], [pausa], [inaudível], [barulho], [tosse], [ruído]
- Caracteres de outros idiomas transcritos por engano (cirílico, tailandês, árabe, etc.)
- Palavras truncadas sem sentido ("tran-", "por-", "isso-")
- Repetições EXATAS da mesma frase na mesma fala (dequeio de transcrição)
- Timestamps e metadados de transcrição automática (ex: "00:01:23", "[Speaker 1]", "WEBVTT")

### 2. PRESERVAR INTEGRALMENTE (não comprimir, não interpretar, não reorganizar):
- **Todo o fluxo cronológico** — a ordem dos turnos de fala é sagrada
- **Tom e nuance emocional** — uma resposta hesitante ("vou tentar, mas não sei se vai dar tempo") deve continuar hesitante, não virar "liderado vai tentar"
- **Conteúdo pessoal com sinal emocional** — se o liderado mencionou estar cansado, com problemas externos, ansioso: PRESERVE. Esses são sinais de saúde da pessoa.
- **Resistências e desconfortos** — se o liderado resistiu a uma sugestão do gestor, preserve como resistência (não suavize)
- **Quem originou cada assunto** — se o gestor trouxe o tema ou se foi o liderado que levantou
- **Contexto de terceiros** — se alguém mencionou que "o Antônio reclamou" ou "a Carla disse que...", preserve o nome e o contexto
- **Compromissos tácitos** — "então a gente combina que você olha isso semana que vem?" deve permanecer como está
- **Silêncios significativos** — se houver indicação de pausa longa ou resposta demorada, pode manter como nota [pausa longa]

### 3. FORMATO DE SAÍDA:

Mantenha o formato de turnos de fala original (Gestor/Liderado ou os nomes reais).
Corrija apenas ortografia e gramática básica (sem mudar o sentido).
NÃO reorganize por temas. NÃO crie seções "## Pontos Discutidos".
NÃO resuma. NÃO interprete. NÃO adicione insights.

Produza um JSON:

{
  "texto_limpo": "transcrição limpa mantendo turnos de fala cronológicos",
  "metadados": {
    "data_reuniao": "YYYY-MM-DD ou null",
    "participantes": ["Nome Gestor", "Nome Liderado"],
    "duracao_minutos": number ou null,
    "speaker_confidence": "alta|media|baixa — quão confiável é a atribuição de fala. 'alta': cada fala tem nome/label claro e consistente. 'media': maioria identificada, algumas ambiguidades. 'baixa': sem identificação ou com atribuição inconsistente."
  },
  "estatisticas": {
    "tokens_removidos": number,
    "percentual_economia": number (0-100)
  }
}

## EXEMPLO:

Entrada:
"Gestor: Ah, então, né, como é que tá indo o projeto X?
Liderado: Hum, tá indo... tá indo, mas assim, vou ser honesto, tô com dificuldade de fechar o escopo, né, porque o time tá sobrecarregado. Tipo, a gente tem o Paulo que saiu e a gente não repôs ainda, então, assim, tá complicado.
Gestor: Entendi. E você falou com o Marcos sobre isso?
Liderado: Falei, mas ele disse que não dá pra contratar agora. Então, tipo, eu não sei como a gente vai entregar no prazo combinado."

Saída:
{
  "texto_limpo": "Gestor: Como está indo o projeto X?\\nLiderado: Está indo, mas vou ser honesto: estou com dificuldade de fechar o escopo porque o time está sobrecarregado. O Paulo saiu e ainda não foi reposto, então está complicado.\\nGestor: Você falou com o Marcos sobre isso?\\nLiderado: Falei, mas ele disse que não dá para contratar agora. Então não sei como vamos entregar no prazo combinado.",
  "metadados": {
    "data_reuniao": null,
    "participantes": ["Gestor", "Liderado"],
    "duracao_minutos": null
  },
  "estatisticas": {
    "tokens_removidos": 28,
    "percentual_economia": 22
  }
}

## TRANSCRIÇÃO BRUTA:

${rawTranscript}

---

Retorne APENAS o JSON válido, sem texto antes ou depois. Certifique-se de que o JSON está completo e bem formatado.`
}

// ─── Modo FULL — para reuniões coletivas ─────────────────────────────────────
// Objetivo: limpeza agressiva + reestruturação por temas para máxima redução de tokens.
// Usado para: daily, planning, retro, review, cerimônias com múltiplos participantes.

function buildFullPrompt(rawTranscript: string): string {
  return `Você é um assistente especializado em processar transcrições de reuniões de equipe de tecnologia.

SUA TAREFA: Limpar e estruturar a transcrição abaixo, removendo ruído e preenchedores, mantendo APENAS informações relevantes para gestão de pessoas e times.

## REGRAS ABSOLUTAS (siga rigorosamente):

### 1. REMOVER (descartar completamente):
- Preenchidos: "né", "tipo", "entendeu", "sabe", "assim", "ó", "aí", "tipo assim"
- Interjeições: "ah", "eh", "hum", "hmmm", "né", "poxa", "cara"
- Sons transcritos: [risos], [pausa], [inaudível], [barulho]
- Frases incompletas que não acrescentam informação
- Repetições exatas (mantenha apenas a primeira ocorrência)
- Conversas sobre assuntos pessoais sem relação com trabalho (clima, futebol, etc.)
- Cumprimentos longos e despedidas sem conteúdo ("Oi, tudo bem? Como foi o fim de semana?")
- Caracteres de outros idiomas transcritos por engano

### 2. PRESERVAR (manter intacto):
- Nomes de pessoas (participantes, terceiros mencionados)
- Datas, prazos e compromissos
- Termos técnicos, nomes de sistemas, siglas
- Números, métricas, percentuais
- Decisões acordadas (quem faz o quê, até quando)
- Feedback recebido ou dado
- Preocupações, bloqueios, impedimentos
- Objetivos, metas, entregas
- Elogios e conquistas
- Sinais emocionais coletivos relevantes: frustração com processo, excitação com resultado, tensão entre membros, resistência a decisão — quando esses sinais aparecem em reunião coletiva, são dados de gestão de times (ex: "time todo demonstrou resistência à proposta de migração", "clima de frustração durante retrospectiva ao discutir prazo")

### 3. ESTRUTURAR (organizar em seções):

Produza um JSON com a seguinte estrutura:

{
  "texto_limpo": "string contendo o transcript processado em formato estruturado",
  "metadados": {
    "data_reuniao": "YYYY-MM-DD ou null",
    "participantes": ["Nome 1", "Nome 2", ...],
    "duracao_minutos": number ou null,
    "speaker_confidence": "alta|media|baixa — quão confiável é a atribuição de fala. 'alta': cada fala tem nome/label claro e consistente. 'media': maioria identificada, algumas ambiguidades. 'baixa': sem identificação ou com atribuição inconsistente."
  },
  "estatisticas": {
    "tokens_removidos": number,
    "percentual_economia": number (0-100)
  }
}

### 4. FORMATO DO TEXTO_LIMPO:

O texto_limpo deve seguir esta estrutura (use markdown):

## Participantes
- [Nome] - [Papel]

## Contexto
[Resumo de 2-3 frases: objetivo da reunião, período, tema central]

## Pontos Discutidos

### Tema 1: [Nome do Tema]
[Quem disse o quê, limpo e direto]

[Repetir para cada tema distinto]

## Decisões e Compromissos
- [O que foi acordado]

## Ações
- [Quem]: [O que fazer] - Prazo: [Data ou período]

## Observações
[Informações relevantes que não se encaixam acima: alertas, sinais, conquistas]

## Observações de Tom (opcional — incluir apenas quando houver sinais emocionais coletivos relevantes)
- [Sinal emocional observado]: [Contexto e momento da reunião]

Exemplos:
- "Frustração generalizada: ao discutir estimativas de prazo, maioria do time expressou resistência — possível desalinhamento de expectativas com stakeholders"
- "Excitação coletiva: demonstração de novo produto gerou energia alta no time, com 3+ membros pedindo para participar do projeto"
- "Tensão pontual: discussão sobre responsabilidade pelo bug de producao gerou atrito entre dois membros — resolvido ao final da retro"
Se não houver sinais emocionais coletivos relevantes, OMITIR a seção completamente.

### 5. PRINCÍPIOS DE LIMPEZA:

- **Concisão:** Se uma ideia pode ser expressa em 10 palavras ao invés de 30, use 10.
- **Clareza:** Converta frases fragmentadas em frases completas e gramaticalmente corretas.
- **Objetividade:** Não interprete, infira ou adicione opiniões. Mantenha os fatos.
- **Neutralidade:** Preserve o tom original (feedback negativo permanece negativo).

## TRANSCRIÇÃO BRUTA:

${rawTranscript}

---

Retorne APENAS o JSON válido, sem texto antes ou depois. Certifique-se de que o JSON está completo e bem formatado.`
}

/**
 * Parseia a resposta do Gemini, extraindo o JSON válido.
 * Tenta múltiplas estratégias de parse.
 */
export function parseGeminiResponse(raw: string): GeminiPreprocessingResult | null {
  const text = raw.trim()

  // Tenta parse com o texto original e, se falhar, com newlines sanitizadas
  for (const candidate of [text, sanitizeJsonNewlines(text)]) {
    // 1. Parse direto
    try {
      const parsed = JSON.parse(candidate)
      if (isValidResult(parsed)) return parsed
    } catch { /* try next */ }

    // 2. Extrair de fence ```json
    const fenceMatch = candidate.match(/```(?:json)?\s*\n([\s\S]+?)\n```/)
    if (fenceMatch) {
      try {
        const parsed = JSON.parse(fenceMatch[1].trim())
        if (isValidResult(parsed)) return parsed
      } catch { /* fall through */ }
    }

    // 3. Encontrar primeiro bloco JSON { ... }
    const braceMatch = candidate.match(/\{[\s\S]+\}/)
    if (braceMatch) {
      try {
        const parsed = JSON.parse(braceMatch[0])
        if (isValidResult(parsed)) return parsed
      } catch { /* fall through */ }
    }
  }

  return null
}

/**
 * Sanitiza newlines literais dentro de valores string em JSON malformado.
 * O Gemini às vezes retorna JSON com \n reais dentro de strings ao invés de \\n escapados.
 */
function sanitizeJsonNewlines(raw: string): string {
  const chars: string[] = []
  let inString = false
  let escaped = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]

    if (escaped) {
      chars.push(ch)
      escaped = false
      continue
    }

    if (ch === '\\' && inString) {
      chars.push(ch)
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      chars.push(ch)
      continue
    }

    if (inString && ch === '\n') {
      chars.push('\\', 'n')
      continue
    }

    if (inString && ch === '\r') {
      chars.push('\\', 'r')
      continue
    }

    if (inString && ch === '\t') {
      chars.push('\\', 't')
      continue
    }

    // Escapa qualquer outro caractere de controle (U+0000–U+001F)
    if (inString) {
      const code = ch.charCodeAt(0)
      if (code < 0x20) {
        chars.push('\\', 'u', '0', '0', code < 0x10 ? '0' : '', code.toString(16))
        continue
      }
    }

    chars.push(ch)
  }

  return chars.join('')
}

function isValidResult(obj: unknown): obj is GeminiPreprocessingResult {
  if (typeof obj !== 'object' || obj === null) return false
  const r = obj as Record<string, unknown>
  return (
    typeof r.texto_limpo === 'string' &&
    typeof r.metadados === 'object' &&
    Array.isArray((r.metadados as Record<string, unknown>)?.participantes) &&
    typeof r.estatisticas === 'object' &&
    typeof (r.estatisticas as Record<string, unknown>)?.tokens_removidos === 'number' &&
    typeof (r.estatisticas as Record<string, unknown>)?.percentual_economia === 'number'
  )
}
