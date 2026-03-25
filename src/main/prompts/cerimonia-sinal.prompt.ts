export interface CerimoniaSinalPromptParams {
  teamRegistry: string        // serializeForPrompt() output
  pessoaNome: string          // nome completo da pessoa alvo
  pessoaCargo: string         // cargo (para calibrar expectativa pelo nível)
  pessoaRelacao: string       // 'liderado' | 'gestor' | 'par' | 'stakeholder'
  perfilMdRaw: string | null  // perfil atual (null = primeira vez)
  ceremonyContent: string     // conteúdo original da cerimônia
  ceremonyTipo: string        // 'daily' | 'planning' | 'retro' | 'reuniao' | 'outro'
  ceremonyData: string        // YYYY-MM-DD
  today: string
}

export interface CerimoniaSinalResult {
  sentimento_detectado: 'positivo' | 'neutro' | 'ansioso' | 'frustrado' | 'desengajado'
  nivel_engajamento: 1 | 2 | 3 | 4 | 5
  indicador_saude: 'verde' | 'amarelo' | 'vermelho'
  motivo_indicador: string
  soft_skills_observadas: string[]
  hard_skills_observadas: string[]
  pontos_de_desenvolvimento: string[]
  feedbacks_positivos: string[]
  feedbacks_negativos: string[]
  temas_detectados: string[]
  sinal_evolucao: boolean
  evidencia_evolucao: string | null
  necessita_1on1: boolean
  motivo_1on1: string | null
  confianca: 'alta' | 'media' | 'baixa'
}

export function buildCerimoniaSinalPrompt(params: CerimoniaSinalPromptParams): string {
  const { teamRegistry, pessoaNome, pessoaCargo, pessoaRelacao, perfilMdRaw, ceremonyContent, ceremonyTipo, ceremonyData, today } = params

  return `Você é o assistente de um gestor de tecnologia. Sua tarefa é analisar a participação de UMA PESSOA ESPECÍFICA em uma cerimônia coletiva e extrair sinais sobre seu comportamento, habilidades e desenvolvimento.

Data atual: ${today}
Data da cerimônia: ${ceremonyData}
Tipo da cerimônia: ${ceremonyTipo}
Pessoa analisada: ${pessoaNome} (${pessoaCargo})

## Time do gestor (contexto)
${teamRegistry}

## Perfil atual da pessoa (contexto histórico)
${perfilMdRaw
  ? `<perfil_atual>\n${perfilMdRaw}\n</perfil_atual>`
  : 'Nenhum perfil ainda. Primeira análise desta pessoa.'}

## Conteúdo da cerimônia
<cerimonia>
${ceremonyContent}
</cerimonia>

## Calibração de framing
A relação desta pessoa com o gestor é: **${pessoaRelacao}**.
- "liderado": foque em desenvolvimento, engajamento e evolução profissional. Tom: "demonstrou", "está evoluindo", "precisa de atenção em".
- "gestor": foque em alinhamento ascendente, suporte recebido e expectativas comunicadas. Nunca use framing de desenvolvimento como se fosse um liderado — não escreva "está evoluindo" ou "precisa desenvolver".
- "par": foque em colaboração horizontal, dependências e alinhamento de trabalho conjunto.
- "stakeholder": foque em gestão de expectativas, alinhamento de entregas e riscos de desalinhamento.

## Sua tarefa

Analise EXCLUSIVAMENTE a participação, comportamento e contribuições de **${pessoaNome}** nesta cerimônia.

Retorne APENAS um JSON válido (sem texto antes ou depois).

REGRAS OBRIGATÓRIAS:

**Foco exclusivo na pessoa:**
- Analise apenas o que ${pessoaNome} disse, fez ou demonstrou — não o que outros disseram sobre ela
- Se a pessoa não aparece ou tem participação mínima: retorne arrays vazios, confianca "baixa", nivel_engajamento 1 ou 2
- Não confunda participação com simples presença — estar listado como participante sem falar não é engajamento

**Qualidade textual:**
- Cada item deve ser uma frase completa e autônoma, compreensível sem ler a cerimônia
- Inclua contexto: o que aconteceu, o que a pessoa fez, qual o impacto ou sinal
- Nunca copie fragmentos garbled, caracteres estranhos ou frases incompletas da transcrição
- Escreva em português brasileiro correto e profissional — corrija ortografia, gramática e pontuação em todos os campos de texto

**Por categoria:**

"soft_skills_observadas": padrões comportamentais observáveis nesta cerimônia.
  - INCLUIR: comunicação (clareza, objetividade, escuta), colaboração, autonomia, gestão de bloqueios, proatividade, resiliência, adaptabilidade
  - Apenas quando houver evidência clara e específica do comportamento
  Exemplos:
  - "Comunicou bloqueio de infraestrutura com clareza durante a daily: descreveu o problema, impacto esperado e o que tentou antes de escalar"
  - "Demonstrou escuta ativa ao incorporar sugestão do colega e ajustar a proposta de arquitetura em tempo real"
  - "Trouxe dois pontos de melhoria concretos na retro com proposta de ação imediata, sem esperar o time perguntar"

"hard_skills_observadas": evidências técnicas concretas observadas nesta cerimônia.
  - INCLUIR: liderou decisão técnica, identificou problema técnico, demonstrou domínio de ferramenta/sistema, estimou corretamente
  - Apenas quando houver evidência objetiva e verificável
  Exemplos:
  - "Liderou decisão técnica sobre migração do serviço de auth baseando-se em análise de trade-offs entre custo e segurança"
  - "Identificou gargalo de performance no pipeline de CI que impactava todo o time — propôs solução de caching"
  - "Quebrou epic complexo em tasks independentes e estimou esforço corretamente (confirmado no sprint seguinte)"

"pontos_de_desenvolvimento": áreas que precisam crescer, observadas nesta cerimônia.
  - INCLUIR: dificuldades evidentes, lacunas técnicas observadas, comportamentos que limitam a efetividade
  - Seja específico: o que foi observado, qual o impacto potencial
  Exemplos:
  - "Participou minimamente da daily — respondeu apenas às perguntas diretas sem contextualizar o status da tarefa, dificultando a visibilidade do time"
  - "Apresentou dificuldade em dimensionar esforço — estimativa 3x acima do realizado no sprint, padrão já observado em ciclos anteriores"
  - "Não participou da discussão de arquitetura onde teria contexto relevante — pode indicar falta de confiança para contribuir em público"

"feedbacks_positivos": reconhecimentos positivos concretos observados nesta cerimônia.
  Exemplos:
  - "Entregou feature complexa antes do prazo e com cobertura de testes completa — mencionado pelo time na retro"
  - "Desbloqueou o time ao resolver incidente de produção em menos de 1 hora durante o horário da daily"

"feedbacks_negativos": observações negativas concretas que merecem atenção.
  Exemplos:
  - "Comprometeu investigação de bug crítico na sprint passada sem atualização — mencionado como item sem follow-up na retro"
  - "Interrompeu colega duas vezes durante explicação técnica na reunião de arquitetura"

"temas_detectados": temas recorrentes identificados (ex: "comunicação assertiva", "liderança técnica", "gestão de tempo").
  Use esses para enriquecer os Temas Recorrentes do perfil.

"sentimento_detectado": estado emocional predominante observado. Um de: "positivo", "neutro", "ansioso", "frustrado", "desengajado". Use "neutro" se não há sinais claros.

"nivel_engajamento": 1 (ausente/silencioso) a 5 (protagonizou a cerimônia). Baseie-se em quantidade e qualidade das contribuições.

"indicador_saude": baseado EXCLUSIVAMENTE no que foi observado NESTA cerimônia. "verde" = engajamento saudável, contribuições positivas. "amarelo" = sinais leves de preocupação. "vermelho" = sinal grave e inequívoco.

"motivo_indicador": 1 frase explicando o indicador com base nesta cerimônia.

"necessita_1on1": true SOMENTE para sinais graves e inequívocos — conflito interpessoal explícito, crise declarada, bloqueio crítico sem resolução. Sinais leves (pessoa quieta, participação abaixo do normal) NÃO justificam true — registre esses em pontos_de_desenvolvimento.

"sinal_evolucao": true se há evidência clara de crescimento em relação ao histórico do perfil.

"confianca":
  - "alta": a pessoa contribuiu ativamente e há evidências claras e múltiplas
  - "media": participação razoável, algumas evidências
  - "baixa": participação mínima, poucas evidências ou cerimônia muito curta

JSON esperado:
{
  "sentimento_detectado": "positivo|neutro|ansioso|frustrado|desengajado",
  "nivel_engajamento": 3,
  "indicador_saude": "verde|amarelo|vermelho",
  "motivo_indicador": "string",
  "soft_skills_observadas": ["string"],
  "hard_skills_observadas": ["string"],
  "pontos_de_desenvolvimento": ["string"],
  "feedbacks_positivos": ["string"],
  "feedbacks_negativos": ["string"],
  "temas_detectados": ["string"],
  "sinal_evolucao": false,
  "evidencia_evolucao": "string ou null",
  "necessita_1on1": false,
  "motivo_1on1": "string ou null",
  "confianca": "alta|media|baixa"
}`
}
