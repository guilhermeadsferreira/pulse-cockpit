export interface IngestionPromptParams {
  teamRegistry: string         // serializeForPrompt() output
  perfilMdRaw: string | null   // current perfil.md content or null if first ingestion
  artifactContent: string      // file content (possibly truncated)
  today: string                // ISO date YYYY-MM-DD
  managerName?: string         // nome real do gestor (usuário do sistema)
}

export interface AcaoComprometida {
  responsavel: string           // nome completo do responsável
  descricao: string             // o que fazer
  prazo_iso: string | null      // YYYY-MM-DD ou null se não mencionado
  responsavel_slug?: string | null  // inferred/injected after processing
}

export function buildIngestionPrompt(params: IngestionPromptParams): string {
  const { teamRegistry, perfilMdRaw, artifactContent, today, managerName } = params
  const gestorLabel = managerName || 'Gestor'

  return `Você é o assistente de um gestor de tecnologia analisando artefatos de reuniões e interações com seu time.

Data atual: ${today}

## Time do gestor
${teamRegistry}

## Perfil atual da pessoa (perfil.md)
${perfilMdRaw
  ? `<perfil_atual>\n${perfilMdRaw}\n</perfil_atual>`
  : 'Nenhum perfil ainda. Esta é a primeira ingestão.'}

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
- "titulo": título descritivo do evento (máximo 80 caracteres). Reflita o propósito real da reunião (ex: "Pós-Warroom: Incidente WAF/Sequence", "Planning Q2 — Plataforma", "1:1 com Ana Lima"). Nunca use nomes de arquivo, slugs internos ou datas isoladas.
- "participantes_nomes": array com os nomes completos (corrigidos) de todos que participaram diretamente. Array vazio para artefatos individuais (1:1, feedback).
- "resumo": 3–5 frases em português claro e preciso. Deve cobrir: contexto/motivo da reunião, o que foi discutido, principais conclusões ou decisões. Para reuniões técnicas, inclua termos e sistemas relevantes. Nunca transcreva trechos garbled.
- "acoes_comprometidas": array de objetos com campos "responsavel" (nome completo do responsável), "descricao" (o que fazer — autônomo e acionável sem contexto da reunião) e "prazo_iso" (data no formato YYYY-MM-DD se mencionado, null caso contrário). Nunca omita "responsavel" — use "${gestorLabel}" se for o próprio usuário do sistema. O campo "descricao" DEVE estar em português brasileiro correto: corrija ortografia, gramática e pontuação — nunca copie texto com erros da transcrição. Escreva como uma instrução clara de tarefa (ex: "Investigar causa raiz da lentidão no endpoint de autenticação e propor solução até sexta" — não "investigar causa raiz da lentidão").
- "sentimento_detectado": estado emocional predominante da pessoa principal observado neste artefato. Um de: "positivo", "neutro", "ansioso", "frustrado", "desengajado". Se não há sinais claros, use "neutro".
- "nivel_engajamento": nível de participação e energia observado. Inteiro de 1 (muito baixo) a 5 (muito alto). Baseie-se em qualidade das respostas, iniciativas propostas, perguntas feitas, energia percebida.
- "pontos_de_atencao": cada item deve ser específico — inclua números, métricas, nomes de sistemas e impacto quando disponíveis. Escreva frase completa, não fragmento. Em reuniões coletivas, inclua aqui sinais comportamentais leves que merecem atenção no próximo 1:1 mas não justificam 1:1 urgente (ex: "Participou pouco da planning de Q2 — pode indicar desalinhamento com o escopo definido", "Ficou em silêncio durante discussão de arquitetura onde costuma opinar").
- "elogios_e_conquistas": cada item deve ser uma frase completa e compreensível, descrevendo quem fez o quê e por que é relevante. Evite frases ambíguas ou dependentes de contexto implícito.
- "temas_detectados": array de strings com temas recorrentes identificados (ex: "desenvolvimento técnico", "comunicação")
- "pontos_resolvidos": se o perfil anterior contém pontos de atenção que foram CLARAMENTE resolvidos ou superados neste artefato, copie o texto EXATO desses pontos aqui. Array vazio se nenhum foi resolvido.
- "resumo_evolutivo": parágrafo narrativo de 4–6 frases integrando o histórico anterior (do perfil) com as novas informações deste artefato. Se não há histórico, escreva a narrativa baseada apenas no artefato. ATENÇÃO — o tom do resumo_evolutivo (e dos campos "resumo", "pontos_de_atencao", "elogios_e_conquistas") deve ser calibrado pelo tipo de relação (campo "relacao" no cadastro do time) da pessoa_principal:
  - relacao "liderado": perspectiva de desenvolvimento. Acompanhe crescimento, engajamento e evolução profissional. Tom: "demonstrou", "está evoluindo", "precisa de atenção em", "avançou no PDI".
  - relacao "gestor": perspectiva de alinhamento e relacionamento ascendente. O gestor registra como está a relação com seu próprio superior. Tom: "alinhamento sobre X", "suporte recebido em Y", "pontos de divergência em Z", "expectativas comunicadas". Nunca use framing de desenvolvimento como se fosse um liderado — não escreva "está evoluindo" ou "precisa desenvolver".
  - relacao "par": perspectiva de colaboração horizontal. Tom: "colaboração em X", "dependência identificada em Y", "alinhamento necessário sobre Z", "parceria produtiva em".
  - relacao "stakeholder": perspectiva de gestão de expectativas. Tom: "expectativa comunicada", "alinhamento sobre entrega", "risco de desalinhamento em", "demanda recebida de".
  - Se pessoa_principal for null (reunião coletiva): use tom neutro de observação de time, sem focar em desenvolvimento individual.
- "temas_atualizados": array com os temas recorrentes COMPLETO e deduplicado, mesclando os temas anteriores (do perfil) com os novos detectados neste artefato
- "indicador_saude": "verde" | "amarelo" | "vermelho" — baseado EXCLUSIVAMENTE no que foi observado NESTE artefato. NUNCA faça média ou ponderação com indicadores anteriores do perfil. Se o histórico mostra verde mas este artefato evidencia problema claro, retorne vermelho. Se o histórico mostra vermelho mas este artefato é positivo e sem sinais de problema, retorne verde. O "Histórico de Saúde" no perfil serve apenas para você entender a tendência — não influencie o valor atual por ele.
- "motivo_indicador": 1 frase explicando o indicador de saúde baseado neste artefato específico
- "necessita_1on1": true apenas se este artefato evidencia necessidade URGENTE de um 1:1 fora da cadência normal. Marque true quando houver: bloqueio sem resolução aparente, tema sensível (carreira, saúde, conflito interpessoal explícito), ação comprometida há muito tempo sem follow-up, ou indicador vermelho com causa identificada. Em reuniões coletivas (daily, planning, retro), use true SOMENTE para sinais graves e inequívocos: conflito interpessoal explícito, pessoa que saiu antes do fim sem justificativa, algo dito diretamente que indica crise. Sinais leves ou ambíguos de reuniões coletivas (pessoa quieta numa daily, leve tensão numa retro, participação abaixo do normal) NÃO devem gerar necessita_1on1: true — registre esses sinais em "pontos_de_atencao" para que apareçam naturalmente na pauta do próximo 1:1 agendado. Para 1:1s já realizados neste artefato, retorne false. Caso contrário, false.
- "motivo_1on1": se necessita_1on1 for true, 1 frase curta descrevendo o motivo (ex: "Bloqueio técnico sem resolução há 2 semanas", "Conflito explícito com colega mencionado durante a planning"). Se false, null.
- "alerta_estagnacao": true se o perfil histórico combinado com este artefato sugere que a pessoa está estagnada — sem crescimento técnico, sem novos desafios, sem avanço no PDI, sem conquistas recentes. Se não há histórico suficiente para avaliar, retorne false.
- "motivo_estagnacao": se alerta_estagnacao for true, 1 frase descrevendo o padrão detectado (ex: "Sem novas entregas ou aprendizados registrados nos últimos 3 meses"). Se false, null.
- "sinal_evolucao": true se este artefato traz evidência clara de crescimento, aprendizado ou evolução em relação ao perfil anterior (nova habilidade demonstrada, entrega significativa, feedback positivo de terceiros, avanço no PDI).
- "evidencia_evolucao": se sinal_evolucao for true, 1 frase descrevendo a evidência (ex: "Liderou sozinho a refatoração do serviço de auth e recebeu elogio do time"). Se false, null.
- "confianca": nível de confiança nas inferências feitas neste artefato. Use "alta" quando o artefato é rico (1:1 detalhado, feedback estruturado, reunião com contexto claro). Use "media" para reuniões coletivas com participação razoável. Use "baixa" quando o artefato for curto (< 300 palavras), uma transcrição muito fragmentada, ambíguo demais para inferências sólidas, ou com evidências contraditórias. Quando "baixa": seja conservador — prefira "verde" ou "amarelo" no indicador_saude quando há dúvida, e evite marcar necessita_1on1: true ou alerta_estagnacao: true sem evidência clara.

JSON esperado:
{
  "tipo": "string",
  "data_artefato": "YYYY-MM-DD",
  "titulo": "string",
  "participantes_nomes": ["string"],
  "pessoas_identificadas": ["slug"],
  "novas_pessoas_detectadas": [{"nome": "string", "slug": "string"}],
  "pessoa_principal": "slug ou null",
  "resumo": "string",
  "acoes_comprometidas": [{"responsavel": "string", "descricao": "string", "prazo_iso": "YYYY-MM-DD ou null"}],
  "pontos_de_atencao": ["string"],
  "elogios_e_conquistas": ["string"],
  "temas_detectados": ["string"],
  "pontos_resolvidos": ["string"],
  "resumo_evolutivo": "string",
  "temas_atualizados": ["string"],
  "indicador_saude": "verde|amarelo|vermelho",
  "motivo_indicador": "string",
  "sentimento_detectado": "positivo|neutro|ansioso|frustrado|desengajado",
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
  pessoa_principal: string | null
  resumo: string
  acoes_comprometidas: AcaoComprometida[]
  pontos_de_atencao: string[]
  elogios_e_conquistas: string[]
  temas_detectados: string[]
  pontos_resolvidos?: string[]
  resumo_evolutivo: string
  temas_atualizados: string[]
  indicador_saude: 'verde' | 'amarelo' | 'vermelho'
  motivo_indicador: string
  sentimento_detectado: 'positivo' | 'neutro' | 'ansioso' | 'frustrado' | 'desengajado'
  nivel_engajamento: 1 | 2 | 3 | 4 | 5
  necessita_1on1: boolean
  motivo_1on1: string | null
  alerta_estagnacao: boolean
  motivo_estagnacao: string | null
  sinal_evolucao: boolean
  evidencia_evolucao: string | null
  confianca: 'alta' | 'media' | 'baixa'
}
