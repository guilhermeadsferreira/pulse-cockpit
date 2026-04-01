import type { IndicadorSaude, NivelConfianca, SentimentoDetectado, NivelEngajamento, SentimentoItem } from './constants'
import { NECESSITA_1ON1_REGRA, CONFIANCA_POR_TIPO_TEXTO, ASPECTO_ENUM, TEMAS_TAXONOMY_TEXTO } from './constants'

export interface IngestionPromptParams {
  teamRegistry: string         // serializeForPrompt() output
  perfilMdRaw: string | null   // current perfil.md content or null if first ingestion
  artifactContent: string      // file content (possibly truncated)
  today: string                // ISO date YYYY-MM-DD
  managerName?: string         // nome real do gestor (usuário do sistema)
  resumosAnteriores?: string   // archived historical summaries for longitudinal context
}

export interface PontoAtencao {
  texto: string
  frequencia: 'primeira_vez' | 'recorrente'
}

export interface AcaoComprometida {
  responsavel: string           // nome completo do responsável
  descricao: string             // o que fazer
  prazo_iso: string | null      // YYYY-MM-DD ou null se não mencionado
  responsavel_slug?: string | null  // inferred/injected after processing
}

export function buildIngestionPrompt(params: IngestionPromptParams): string {
  const { teamRegistry, perfilMdRaw, artifactContent, today, managerName, resumosAnteriores } = params
  const gestorLabel = managerName || 'Gestor'

  return `Você é o assistente de um gestor de tecnologia analisando artefatos de reuniões e interações com seu time.

Data atual: ${today}

## Time do gestor
${teamRegistry}

## Perfil atual da pessoa (perfil.md)
${perfilMdRaw
  ? `<perfil_atual>\n${perfilMdRaw}\n</perfil_atual>`
  : 'Nenhum perfil ainda. Esta é a primeira ingestão.'}
${resumosAnteriores ? `\n## Resumos Evolutivos Anteriores (contexto longitudinal)\nEstes são resumos evolutivos arquivados de ingestões anteriores — use para enriquecer o campo "resumo_evolutivo" com continuidade histórica:\n<resumos_anteriores>\n${resumosAnteriores}\n</resumos_anteriores>` : ''}

## Artefato a processar
<artefato>
${artifactContent}
</artefato>

## Sua tarefa

Analise o artefato e retorne APENAS um JSON válido (sem texto antes ou depois) com a estrutura abaixo.

IMPORTANTE — Qualidade textual obrigatória:
O artefato pode ser uma transcrição automática com imperfeições: caracteres de outros idiomas (cirílico, tailandês, etc.), palavras truncadas, sons transcritos literalmente, frases incompletas. Ao preencher TODOS os campos de texto do JSON, você DEVE:
1. Interpretar o contexto e escrever em português brasileiro correto e profissional
2. Nunca copiar texto garbled, caracteres estranhos ou frases incompletas da transcrição
3. Inferir nomes de pessoas, sistemas e termos técnicos a partir do contexto quando a transcrição os corrompeu
4. Cada campo de texto deve ser compreensível de forma autônoma — sem precisar ler a transcrição

Regras obrigatórias:
- "tipo": um de "1on1", "reuniao", "daily", "planning", "retro", "feedback", "outro"
- "data_artefato": data da reunião/evento no formato YYYY-MM-DD (extrair do conteúdo ou usar data atual)
- "pessoas_identificadas": slugs das pessoas do time cadastrado que PARTICIPARAM DIRETAMENTE do evento (estavam presentes). NÃO inclua pessoas apenas mencionadas durante a conversa ("o Pedro disse que...", "vamos falar com a Ana"). Regras por tipo:
  - 1on1: máximo 1 pessoa (o liderado — o gestor é o usuário do sistema e não entra aqui)
  - reuniao/planning/retro/daily: apenas participantes presentes, não mencionados
  - feedback/outro: a pessoa que recebeu o feedback ou é o sujeito do artefato
- "pessoa_principal": a pessoa SOBRE QUEM este artefato é mais relevante para o gestor. Para 1:1 é sempre o liderado presente. Para reuniões com múltiplos participantes, a pessoa cujo desenvolvimento é mais central (ou null se for evento coletivo sem foco individual claro). Use o slug do time cadastrado se disponível, senão o slug de novas_pessoas_detectadas.
- "novas_pessoas_detectadas": array de {"nome": "Nome Completo", "slug": "nome-sobrenome"} com pessoas que PARTICIPARAM do evento mas NÃO estão no time cadastrado. Mesma regra: participantes, não mencionados. Para 1:1: o liderado se não cadastrado. Gere o slug em lowercase com hifens (ex: "Antonio Silva" → "antonio-silva"). Array vazio se não houver.
- "pessoas_esperadas_ausentes": slugs de pessoas do time cadastrado que DEVERIAM estar presentes neste tipo de evento mas estavam ausentes. Use o contexto para inferir: se é planning e o owner de um item de backlog não apareceu, registre. Se é retro e um membro fixo do time não apareceu, registre. Em reuniões ad-hoc ou 1:1, use array vazio — ausência não é informativa nesses contextos. Nunca registre alguém que simplesmente não foi mencionado.
- "titulo": título descritivo do evento (máximo 80 caracteres). Reflita o propósito real da reunião (ex: "Pós-Warroom: Incidente WAF/Sequence", "Planning Q2 — Plataforma", "1:1 com Ana Lima"). Nunca use nomes de arquivo, slugs internos ou datas isoladas.
- "participantes_nomes": array com os nomes completos (corrigidos) de todos que participaram diretamente. Array vazio para artefatos individuais (1:1, feedback).
- "resumo": 3–5 frases em português claro e preciso. Deve responder obrigatoriamente 3 perguntas: (1) Por que essa reunião aconteceu? — contexto ou gatilho. (2) O que foi DECIDIDO ou ALINHADO? — não "discutido", o que MUDOU ou ficou definido. (3) O que muda depois? — direção nova, entendimento novo, consequências. Nunca escreva "foram discutidos vários temas" — especifique QUAIS temas, QUAL decisão, QUAL impacto. Para reuniões técnicas, inclua sistemas e termos relevantes. Nunca transcreva trechos garbled.
- "acoes_comprometidas": array de objetos com campos "responsavel" (nome completo do responsável), "descricao" (o que fazer — autônomo e acionável sem contexto da reunião) e "prazo_iso" (data no formato YYYY-MM-DD se mencionado, null caso contrário). REGRA CRÍTICA de responsável: "responsavel" é a pessoa que VAI EXECUTAR a ação — não quem pediu ou sugeriu. Se o gestor solicita e o liderado aceita: responsável é o liderado. Se o gestor diz "eu vou fazer X" ou "vou verificar isso": responsável é "${gestorLabel}". Se ambíguo: (1) quem disse "eu vou" ou "eu faço" → responsável. (2) Se ninguém disse, quem recebeu a instrução direta → responsável. (3) Se ainda ambíguo → responsável é "${gestorLabel}". Nunca omita "responsavel". O campo "descricao" deve ser autônomo e compreensível por alguém que não participou da reunião — padrão: O QUÊ fazer + SOBRE O QUÊ + PARA QUÊ. Ruim: "Resolver o problema" / "Ver aquilo que conversamos". Bom: "Investigar causa raiz da lentidão no endpoint de autenticação e propor solução" / "Alinhar com o time de plataforma sobre migração do Kafka antes do próximo planning". O campo DEVE estar em português brasileiro correto: corrija ortografia, gramática e pontuação — nunca copie texto com erros da transcrição.
- "sentimentos": array de objetos representando o estado emocional da pessoa principal com contexto. Cada objeto: {"valor": "positivo|neutro|ansioso|frustrado|desengajado", "aspecto": ${ASPECTO_ENUM}}. Use múltiplos itens quando sentimentos diferentes convivem em aspectos distintos — ex: positivo/carreira + ansioso/entrega. Se não há sinais claros, use [{"valor": "neutro", "aspecto": "geral"}]. Array nunca vazio.
- "nivel_engajamento": nível de participação e energia observado. Inteiro de 1 (muito baixo) a 5 (muito alto). Baseie-se em qualidade das respostas, iniciativas propostas, perguntas feitas, energia percebida.
- "pontos_de_atencao": array de objetos com "texto" e "frequencia". Padrão obrigatório para "texto": [O QUÊ está acontecendo] + [EVIDÊNCIA concreta] + [IMPACTO potencial]. Nunca use descrições genéricas sem evidência. Ruim: "Comunicação precisa melhorar" / "Qualidade das entregas baixa". Bom: "PRs chegando para revisão com erros críticos repetidos, sobrecarregando os seniors (mencionado pelo TL na reunião) — pode afetar ritmo de entregas do time" / "Estimativas sistematicamente 2–3x acima do realizado nos últimos 2 sprints — impacta planejamento do time". "frequencia": use "recorrente" se o perfil anterior já registra este mesmo padrão (mesma área, mesmo comportamento); use "primeira_vez" se é sinal novo. Quando não há perfil anterior, use sempre "primeira_vez". Inclua números, métricas e nomes de sistemas quando disponíveis. Em reuniões coletivas, inclua sinais comportamentais leves que merecem atenção no próximo 1:1 mas não justificam 1:1 urgente.
- "elogios_e_conquistas": cada item deve ser uma frase completa e compreensível, descrevendo quem fez o quê e por que é relevante. Evite frases ambíguas ou dependentes de contexto implícito.
- "temas_detectados": array de strings com temas recorrentes identificados. ${TEMAS_TAXONOMY_TEXTO}
- "pontos_resolvidos": se o perfil anterior contém pontos de atenção que foram CLARAMENTE resolvidos ou superados neste artefato, copie o texto EXATO desses pontos aqui. Array vazio se nenhum foi resolvido.
- "resumo_evolutivo": parágrafo narrativo de 4–6 frases integrando o histórico anterior (do perfil) com as novas informações deste artefato. Se não há histórico, escreva a narrativa baseada apenas no artefato. ATENÇÃO — o tom do resumo_evolutivo (e dos campos "resumo", "pontos_de_atencao", "elogios_e_conquistas") deve ser calibrado pelo tipo de relação (campo "relacao" no cadastro do time) da pessoa_principal:
  - relacao "liderado": perspectiva de desenvolvimento. Acompanhe crescimento, engajamento e evolução profissional. Tom: "demonstrou", "está evoluindo", "precisa de atenção em", "avançou no PDI".
  - relacao "gestor": perspectiva de alinhamento e relacionamento ascendente. O gestor registra como está a relação com seu próprio superior. Tom: "alinhamento sobre X", "suporte recebido em Y", "pontos de divergência em Z", "expectativas comunicadas". Nunca use framing de desenvolvimento como se fosse um liderado — não escreva "está evoluindo" ou "precisa desenvolver".
  - relacao "par": perspectiva de colaboração horizontal. Tom: "colaboração em X", "dependência identificada em Y", "alinhamento necessário sobre Z", "parceria produtiva em".
  - relacao "stakeholder": perspectiva de gestão de expectativas. Tom: "expectativa comunicada", "alinhamento sobre entrega", "risco de desalinhamento em", "demanda recebida de".
  - Se pessoa_principal for null (reunião coletiva): use tom neutro de observação de time, sem focar em desenvolvimento individual.
- "temas_atualizados": array com os temas recorrentes COMPLETO e deduplicado, mesclando os temas anteriores (do perfil) com os novos detectados neste artefato. ${TEMAS_TAXONOMY_TEXTO}
- "indicador_saude": "verde" | "amarelo" | "vermelho" — baseado EXCLUSIVAMENTE no que foi observado NESTE artefato. NUNCA faça média ou ponderação com indicadores anteriores do perfil. Se o histórico mostra verde mas este artefato evidencia problema claro, retorne vermelho. Se o histórico mostra vermelho mas este artefato é positivo e sem sinais de problema, retorne verde. O "Histórico de Saúde" no perfil serve apenas para você entender a tendência — não influencie o valor atual por ele.
- "motivo_indicador": 1 frase explicando o indicador de saúde baseado neste artefato específico
- "necessita_1on1": ${NECESSITA_1ON1_REGRA} Para 1:1s já realizados neste artefato, retorne sempre false.
- "motivo_1on1": se necessita_1on1 for true, 1 frase curta descrevendo o motivo (ex: "Bloqueio técnico sem resolução há 2 semanas", "Conflito explícito com colega mencionado durante a planning"). Se false, null.
- "alerta_estagnacao": true se o perfil histórico combinado com este artefato sugere que a pessoa está estagnada — sem crescimento técnico, sem novos desafios, sem avanço no PDI, sem conquistas recentes. Janela de avaliação mínima: 2 artefatos nos últimos 90 dias sem nenhum sinal de crescimento. NÃO aguarde 6+ meses para reportar — early stagnation (0-3 meses) é igualmente relevante. Se há apenas 1 artefato no histórico, retorne false.
- "motivo_estagnacao": se alerta_estagnacao for true, 1 frase descrevendo o padrão detectado (ex: "Sem novas entregas ou aprendizados registrados nos últimos 3 meses"). Se false, null.
- "sinal_evolucao": true se este artefato traz evidência clara de crescimento, aprendizado ou evolução em relação ao perfil anterior (nova habilidade demonstrada, entrega significativa, feedback positivo de terceiros, avanço no PDI).
- "evidencia_evolucao": se sinal_evolucao for true, 1 frase descrevendo a evidência (ex: "Liderou sozinho a refatoração do serviço de auth e recebeu elogio do time"). Se false, null.
- "confianca": ${CONFIANCA_POR_TIPO_TEXTO}

## Exemplo de output esperado

Para um 1:1 onde o liderado relatou progresso em uma task mas demonstrou ansiedade com prazo:

\`\`\`json
{
  "tipo": "1on1",
  "data_artefato": "2026-03-28",
  "titulo": "1:1 com Ana Lima — progresso na migração e preocupação com prazo",
  "participantes_nomes": [],
  "pessoas_identificadas": ["ana-lima"],
  "novas_pessoas_detectadas": [],
  "pessoas_esperadas_ausentes": [],
  "pessoa_principal": "ana-lima",
  "resumo": "Ana apresentou progresso na migração do serviço de auth para o novo provider, com 60% dos endpoints migrados. Ficou definido que o prazo será renegociado com o PM para incluir testes de integração. A principal preocupação é o risco de regressão nos fluxos de pagamento que dependem do auth.",
  "acoes_comprometidas": [
    {"responsavel": "Ana Lima", "descricao": "Finalizar migração dos endpoints restantes do serviço de auth e rodar suite de testes de integração antes de abrir PR", "prazo_iso": "2026-04-04"},
    {"responsavel": "${gestorLabel}", "descricao": "Renegociar prazo da migração de auth com PM incluindo buffer para testes de integração", "prazo_iso": null}
  ],
  "pontos_de_atencao": [
    {"texto": "Ansiedade com prazo da migração de auth — Ana mencionou que está trabalhando fora do horário para compensar, o que pode indicar subdimensionamento da task ou dificuldade em pedir ajuda", "frequencia": "primeira_vez"}
  ],
  "elogios_e_conquistas": ["Ana migrou 60% dos endpoints de auth em 1 semana, mantendo cobertura de testes — ritmo acima do estimado"],
  "temas_detectados": ["entregas", "qualidade"],
  "pontos_resolvidos": [],
  "resumo_evolutivo": "Ana demonstra ownership forte sobre a migração de auth, com entregas consistentes. Neste 1:1, o progresso técnico foi sólido (60% dos endpoints migrados com testes), mas surgiu um sinal de ansiedade relacionado ao prazo que merece monitoramento. A decisão de renegociar o prazo com o PM deve aliviar a pressão.",
  "temas_atualizados": ["entregas", "qualidade"],
  "indicador_saude": "amarelo",
  "motivo_indicador": "Progresso técnico sólido mas ansiedade com prazo e trabalho fora do horário são sinais de atenção",
  "sentimentos": [{"valor": "positivo", "aspecto": "entrega"}, {"valor": "ansioso", "aspecto": "processo"}],
  "nivel_engajamento": 4,
  "necessita_1on1": false,
  "motivo_1on1": null,
  "alerta_estagnacao": false,
  "motivo_estagnacao": null,
  "sinal_evolucao": true,
  "evidencia_evolucao": "Migrou 60% dos endpoints de auth em 1 semana com cobertura de testes mantida",
  "confianca": "alta"
}
\`\`\`

JSON esperado:
{
  "tipo": "string",
  "data_artefato": "YYYY-MM-DD",
  "titulo": "string",
  "participantes_nomes": ["string"],
  "pessoas_identificadas": ["slug"],
  "novas_pessoas_detectadas": [{"nome": "string", "slug": "string"}],
  "pessoas_esperadas_ausentes": ["slug"],
  "pessoa_principal": "slug ou null",
  "resumo": "string",
  "acoes_comprometidas": [{"responsavel": "string", "descricao": "string", "prazo_iso": "YYYY-MM-DD ou null"}],
  "pontos_de_atencao": [{"texto": "string", "frequencia": "primeira_vez|recorrente"}],
  "elogios_e_conquistas": ["string"],
  "temas_detectados": ["string"],
  "pontos_resolvidos": ["string"],
  "resumo_evolutivo": "string",
  "temas_atualizados": ["string"],
  "indicador_saude": "verde|amarelo|vermelho",
  "motivo_indicador": "string",
  "sentimentos": [{"valor": "positivo|neutro|ansioso|frustrado|desengajado", "aspecto": "string"}],
  "nivel_engajamento": 1,
  "necessita_1on1": true,
  "motivo_1on1": "string ou null",
  "alerta_estagnacao": true,
  "motivo_estagnacao": "string ou null",
  "sinal_evolucao": true,
  "evidencia_evolucao": "string ou null",
  "confianca": "alta|media|baixa"
}`
}

export interface IngestionAIResult {
  tipo: string
  data_artefato: string
  titulo?: string
  participantes_nomes?: string[]
  pessoas_identificadas: string[]
  novas_pessoas_detectadas: Array<{ nome: string; slug: string }>
  pessoas_esperadas_ausentes?: string[]
  pessoa_principal: string | null
  resumo: string
  acoes_comprometidas: AcaoComprometida[]
  pontos_de_atencao: PontoAtencao[]
  elogios_e_conquistas: string[]
  temas_detectados: string[]
  pontos_resolvidos?: string[]
  resumo_evolutivo: string
  temas_atualizados: string[]
  indicador_saude: IndicadorSaude
  motivo_indicador: string
  sentimentos: SentimentoItem[]
  /** @deprecated use sentimentos */
  sentimento_detectado?: SentimentoDetectado
  nivel_engajamento: NivelEngajamento
  necessita_1on1: boolean
  motivo_1on1: string | null
  alerta_estagnacao: boolean
  motivo_estagnacao: string | null
  sinal_evolucao: boolean
  evidencia_evolucao: string | null
  confianca: NivelConfianca
}
