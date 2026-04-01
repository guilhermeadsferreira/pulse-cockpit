import type { IndicadorSaude, NivelConfianca, SentimentoDetectado, NivelEngajamento, SentimentoItem } from './constants'
import { NECESSITA_1ON1_REGRA, ASPECTO_ENUM, TEMAS_TAXONOMY_TEXTO } from './constants'

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
  sentimentos: SentimentoItem[]
  /** @deprecated use sentimentos */
  sentimento_detectado?: SentimentoDetectado
  nivel_engajamento: NivelEngajamento
  indicador_saude: IndicadorSaude
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
  confianca: NivelConfianca
  resumo_evolutivo: string | null
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
- "eu" (o próprio gestor analisando sua participação): foque em como o gestor se comportou nesta cerimônia — como facilitou discussões, que decisões tomou, que sinais deu ao time. Tom neutro e observacional: "facilitou", "comunicou", "decidiu", "demonstrou". Não use framing de desenvolvimento de liderado.

## Sua tarefa

Analise EXCLUSIVAMENTE a participação, comportamento e contribuições de **${pessoaNome}** nesta cerimônia.

Retorne APENAS um JSON válido (sem texto antes ou depois).

REGRAS OBRIGATÓRIAS:

**Foco exclusivo na pessoa:**
- Analise apenas o que ${pessoaNome} disse, fez ou demonstrou — não o que outros disseram sobre ela
- Se a pessoa não aparece ou tem participação mínima: retorne arrays vazios, confianca "baixa", nivel_engajamento 1 ou 2
- Não confunda participação com simples presença — estar listado como participante sem falar não é engajamento

**Expectativas mínimas por tipo de cerimônia (calibre nivel_engajamento e indicador_saude com base nisso):**
- **daily**: qualquer atualização de status — mesmo breve — conta como participação. Silêncio total é sinal.
- **planning**: espera-se que a pessoa comente sobre itens do backlog relevantes ao seu trabalho, faça estimativas ou perguntas. Só ouvir sem reagir é participação mínima.
- **retro**: espera-se pelo menos uma perspectiva própria (positiva ou de melhoria). Concordar com tudo sem contribuição original é sinal de baixo engajamento.
- **review**: espera-se demonstração técnica ou comentário técnico fundamentado. Presença passiva conta pouco.
- **reuniao/outro**: avalie pela natureza e relevância para a pessoa. Se o assunto era diretamente sobre sua área e ela não contribuiu, registre.

**Qualidade textual:**
- Cada item deve ser uma frase completa e autônoma, compreensível sem ler a cerimônia
- Inclua contexto: o que aconteceu, o que a pessoa fez, qual o impacto ou sinal
- Nunca copie fragmentos garbled, caracteres estranhos ou frases incompletas da transcrição
- Escreva em português brasileiro correto e profissional — corrija ortografia, gramática e pontuação em todos os campos de texto

**Cruzamento com perfil (obrigatório se perfil disponível):**
${perfilMdRaw ? `A pessoa tem pontos de atenção e temas recorrentes no perfil. Se você observar evidência de MELHORIA ou PIORA em algum ponto de atenção ativo, registre explicitamente nos campos relevantes (feedbacks_positivos para melhoria, pontos_de_desenvolvimento para piora). Conecte observações aos temas recorrentes quando aplicável.` : 'Sem perfil anterior — analise apenas com base nesta cerimônia.'}

**Por categoria:**

"soft_skills_observadas": descreva O QUE A PESSOA FEZ, não uma label genérica.
  - NUNCA retorne labels como "boa comunicação", "proatividade", "trabalho em equipe"
  - SEMPRE descreva o comportamento observado com contexto
  - Se participação insuficiente para gerar skill concreta, retorne array vazio
  Ruim: "boa comunicação" / "proatividade" / "trabalho em equipe"
  Bom:
  - "Comunicou bloqueio de infraestrutura com clareza durante a daily: descreveu o problema, impacto esperado e o que tentou antes de escalar"
  - "Demonstrou escuta ativa ao incorporar sugestão do colega e ajustar a proposta de arquitetura em tempo real"
  - "Trouxe dois pontos de melhoria concretos na retro com proposta de ação imediata, sem esperar o time perguntar"

"hard_skills_observadas": evidências técnicas concretas e verificáveis, não labels.
  Ruim: "bom conhecimento técnico" / "domínio de ferramentas"
  Bom:
  - "Liderou decisão técnica sobre migração do serviço de auth baseando-se em análise de trade-offs entre custo e segurança"
  - "Identificou gargalo de performance no pipeline de CI que impactava todo o time — propôs solução de caching"
  - "Quebrou epic complexo em tasks independentes e estimou esforço corretamente (confirmado no sprint seguinte)"

"pontos_de_desenvolvimento": áreas que precisam crescer, observadas nesta cerimônia.
  - Seja específico: o que foi observado, qual o impacto potencial
  - Se um ponto de atenção do perfil piorou, mencione explicitamente
  Exemplos:
  - "Participou minimamente da daily — respondeu apenas às perguntas diretas sem contextualizar o status da tarefa, dificultando a visibilidade do time"
  - "Apresentou dificuldade em dimensionar esforço — estimativa 3x acima do realizado no sprint, padrão já observado em ciclos anteriores"
  - "Não participou da discussão de arquitetura onde teria contexto relevante — pode indicar falta de confiança para contribuir em público"

"feedbacks_positivos": padrão obrigatório: [QUEM] + [FEZ O QUÊ] + [IMPACTO].
  Ruim: "Bom trabalho" / "Mandou bem"
  Bom:
  - "Entregou feature complexa de pagamentos antes do prazo e com cobertura de testes completa — reduzindo risco de regressão no release"
  - "Desbloqueou o time ao resolver incidente de produção em menos de 1 hora durante o horário da daily"
  - "Identificou edge case no fluxo de pagamento durante planning que evitaria bug em produção"

"feedbacks_negativos": padrão obrigatório: [QUEM] + [FEZ O QUÊ] + [IMPACTO].
  Ruim: "Precisa melhorar" / "Não foi bem"
  Bom:
  - "Comprometeu investigação de bug crítico na sprint passada sem atualização — citado como item sem follow-up na retro, gerou retrabalho"
  - "Interrompeu colega duas vezes durante explicação técnica na reunião de arquitetura — prejudicou a dinâmica da discussão"

"temas_detectados": temas recorrentes identificados. ${TEMAS_TAXONOMY_TEXTO}
  Use esses para enriquecer os Temas Recorrentes do perfil.

"sentimentos": array de objetos com estado emocional e aspecto. Cada objeto: {"valor": "positivo|neutro|ansioso|frustrado|desengajado", "aspecto": ${ASPECTO_ENUM}}. Use múltiplos itens quando sentimentos distintos coexistem em aspectos diferentes. Se não há sinais claros, use [{"valor": "neutro", "aspecto": "geral"}]. Array nunca vazio.

"nivel_engajamento": 1 (ausente/silencioso) a 5 (protagonizou a cerimônia). Baseie-se em quantidade e qualidade das contribuições. Participação suficiente = pessoa fez pelo menos 1 contribuição substantiva (proposta, argumento, decisão) na cerimônia, não apenas presença passiva.

"indicador_saude": baseado EXCLUSIVAMENTE no que foi observado NESTA cerimônia. "verde" = engajamento saudável, contribuições positivas. "amarelo" = sinais leves de preocupação. "vermelho" = sinal grave e inequívoco. CALIBRE pelo cargo/nível (${pessoaCargo}): para pessoas em nível sênior ou de liderança, o bar de "verde" é mais alto — espera-se contribuição ativa, tomada de posição e influência nas discussões. Para níveis júnior/pleno em início de trajetória, participação mais passiva com sinais de aprendizado pode ser "verde". Mesmos comportamentos podem ter indicadores diferentes dependendo do nível.

"motivo_indicador": 1 frase explicando o indicador com base nesta cerimônia.

"necessita_1on1": ${NECESSITA_1ON1_REGRA}

"sinal_evolucao": true se há evidência clara de crescimento em relação ao histórico do perfil.

"confianca":
  - "alta": a pessoa contribuiu ativamente e há evidências claras e múltiplas
  - "media": participação razoável, algumas evidências
  - "baixa": participação mínima, poucas evidências ou cerimônia muito curta

${perfilMdRaw === null ? `"resumo_evolutivo": escreva 3–5 frases narrativas em português profissional sobre a participação e perfil observado de ${pessoaNome} nesta cerimônia. Inclua: comportamento observado, pontos fortes, o que merece atenção futura. Calibre pelo papel (${pessoaRelacao}). Este campo é obrigatório pois não existe perfil anterior desta pessoa.` : '"resumo_evolutivo": null — já existe perfil anterior, não gere narrativa.'}

## Exemplo de output esperado

Para uma planning onde o liderado contribuiu ativamente com estimativas e propôs quebra de épico:

\`\`\`json
{
  "sentimentos": [{"valor": "positivo", "aspecto": "entrega"}],
  "nivel_engajamento": 4,
  "indicador_saude": "verde",
  "motivo_indicador": "Contribuição ativa com estimativas fundamentadas e proposta de quebra de épico — engajamento acima do esperado para o nível",
  "soft_skills_observadas": ["Propôs proativamente a quebra do épico de migração em 3 tasks independentes, facilitando o planejamento do time"],
  "hard_skills_observadas": ["Estimou esforço da migração de banco com base em experiência anterior com Postgres — estimativa validada pelo tech lead"],
  "pontos_de_desenvolvimento": [],
  "feedbacks_positivos": ["Bruno quebrou épico complexo de migração em tasks estimáveis e independentes — acelerou a planning em 15 minutos"],
  "feedbacks_negativos": [],
  "temas_detectados": ["entregas", "colaboracao"],
  "sinal_evolucao": false,
  "evidencia_evolucao": null,
  "necessita_1on1": false,
  "motivo_1on1": null,
  "confianca": "alta",
  "resumo_evolutivo": null
}
\`\`\`

JSON esperado:
{
  "sentimentos": [{"valor": "positivo|neutro|ansioso|frustrado|desengajado", "aspecto": "string"}],
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
  "confianca": "alta|media|baixa",
  "resumo_evolutivo": null
}`
}
