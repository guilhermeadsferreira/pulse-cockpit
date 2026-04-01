export interface OneOnOneDeepPromptParams {
  artifactContent: string        // transcrição/anotação do 1:1
  perfilMdRaw: string | null     // perfil.md atual da pessoa
  configYaml: string             // config.yaml da pessoa (inclui PDI)
  openActionsLiderado: string    // ações abertas do liderado serializadas
  openActionsGestor: string      // ações abertas do gestor serializadas
  sinaisTerceiros: string        // sinais de terceiros do perfil
  historicoSaude: string         // últimas 5 entradas do histórico de saúde
  contagem1on1s: number          // quantas entradas de 1:1 existem no histórico de saúde
  externalData?: string          // métricas Jira/GitHub do external_data.yaml
  today: string                  // YYYY-MM-DD
  managerName?: string
}

export interface OneOnOneFollowup {
  acao_original: string
  acao_id: string
  status: 'cumprida' | 'em_andamento' | 'nao_mencionada' | 'abandonada'
  evidencia: string | null
}

export interface OneOnOneAcaoLiderado {
  descricao: string
  tipo: 'tarefa_explicita' | 'compromisso_informal' | 'mudanca_processo' | 'pdi'
  prazo_iso: string | null
  origem_pauta: 'liderado' | 'gestor' | 'terceiro'
  terceiro_nome: string | null
  contexto: string
}

export interface OneOnOneAcaoGestor {
  descricao: string
  prazo_iso: string | null
}

export interface OneOnOneInsight {
  categoria: 'carreira' | 'pdi' | 'expectativas' | 'feedback_dado'
    | 'feedback_recebido' | 'relacionamento' | 'pessoal' | 'processo'
  conteudo: string
  relevancia: 'alta' | 'media'
  acao_implicita: string | null
}

export interface OneOnOneSugestao {
  descricao: string
  resposta_liderado: 'aceitou_explicito' | 'aceitou_tacito' | 'resistiu' | 'ficou_em_aberto'
  gerar_acao: boolean
}

export interface OneOnOneCorrelacao {
  sinal_original: string
  fonte: string
  confirmado_pelo_liderado: boolean
  contexto_confirmacao: string | null
}

export interface OneOnOnePdiUpdate {
  houve_mencao_pdi: boolean
  objetivos_mencionados: string[]
  novo_objetivo_sugerido: string | null
  progresso_observado: string | null
}

export interface OneOnOnePrioridadeAtualizada {
  acao_id: string
  nova_prioridade: 'baixa' | 'media' | 'alta'
  motivo: string
}

export interface OneOnOneResult {
  followup_acoes: OneOnOneFollowup[]
  acoes_liderado: OneOnOneAcaoLiderado[]
  acoes_gestor: OneOnOneAcaoGestor[]
  insights_1on1: OneOnOneInsight[]
  sugestoes_gestor: OneOnOneSugestao[]
  correlacoes_terceiros: OneOnOneCorrelacao[]
  tendencia_emocional: 'estavel' | 'melhorando' | 'deteriorando' | 'novo_sinal'
  nota_tendencia: string
  pdi_update: OneOnOnePdiUpdate
  resumo_executivo_rh: string
  auto_percepcao?: 'alinhada_com_feedback' | 'cega' | 'inflacionada_positivamente' | null
  prioridade_atualizada: OneOnOnePrioridadeAtualizada[]
}

export function build1on1DeepPrompt(params: OneOnOneDeepPromptParams): string {
  const {
    artifactContent, perfilMdRaw, configYaml,
    openActionsLiderado, openActionsGestor,
    sinaisTerceiros, historicoSaude, contagem1on1s, externalData, today, managerName,
  } = params
  const gestorLabel = managerName || 'Gestor'

  return `Você é o assistente de um gestor de tecnologia. Sua tarefa é fazer uma análise PROFUNDA de um 1:1 já realizado, extraindo follow-ups, compromissos, insights qualitativos e correlações — informações que uma análise genérica de reunião não captura.

IMPORTANTE: Este pass complementa uma análise genérica já realizada. Foque no que é ESPECÍFICO de um 1:1: follow-up de ações, compromissos tácitos, insights de carreira/PDI, correlação com sinais de terceiros, tendência emocional.

Data atual: ${today}
Nome do gestor (usuário do sistema): ${gestorLabel}

## Configuração da pessoa (config.yaml)
<config>
${configYaml}
</config>

## Perfil atual da pessoa (perfil.md)
${perfilMdRaw
  ? `<perfil_atual>\n${perfilMdRaw}\n</perfil_atual>`
  : 'Nenhum perfil ainda.'}

## Ações abertas do liderado
${openActionsLiderado || 'Nenhuma ação aberta.'}

## Ações abertas do gestor (prometidas ao liderado)
${openActionsGestor || 'Nenhuma ação aberta.'}

## Sinais de terceiros (de cerimônias e outros artefatos)
${sinaisTerceiros || 'Nenhum sinal de terceiro registrado.'}

## Histórico de saúde recente
${historicoSaude || 'Sem histórico.'}
${externalData ? `
## Dados Externos (métricas objetivas Jira/GitHub)
${externalData}
` : ''}
## Transcrição / anotação do 1:1
<artefato>
${artifactContent}
</artefato>

## Sua tarefa

Analise o 1:1 e retorne APENAS um JSON válido (sem texto antes ou depois) com a estrutura abaixo.

QUALIDADE TEXTUAL — Regra absoluta:
O artefato pode ser transcrição automática com imperfeições. Ao preencher TODOS os campos:
1. Escreva em português brasileiro correto e profissional
2. Nunca copie texto garbled, caracteres estranhos ou frases incompletas
3. Cada campo deve ser compreensível de forma autônoma — sem precisar ler a transcrição

### REGRAS POR CAMPO:

**"followup_acoes"** — Follow-up obrigatório de ações anteriores:
Para CADA ação listada em "Ações abertas do liderado" e "Ações abertas do gestor", determine o status com base no que foi dito no 1:1.
- "acao_original": copie o texto da ação como fornecido acima
- "acao_id": copie o ID da ação como fornecido acima
- "status":
  - "cumprida": liderado/gestor confirma que fez, há evidência concreta
  - "em_andamento": mencionou que está fazendo, progresso parcial
  - "nao_mencionada": não apareceu no 1:1 (atenção: isso é um sinal)
  - "abandonada": contexto mudou, ação não faz mais sentido, ou declarado explicitamente
- "evidencia": transcreva a evidência concreta se houver, null se "nao_mencionada"
- NÃO invente evidência. Se não foi mencionada, marque "nao_mencionada".

**"acoes_liderado"** — Novas ações do liderado:
- "descricao": acionável, autônoma, compreensível por quem não leu a transcrição. Padrão: O QUÊ + SOBRE O QUÊ + PARA QUÊ.
- "tipo":
  - "tarefa_explicita": ação pontual e verificável ("entregar proposta até sexta")
  - "compromisso_informal": algo aceito tacitamente ou em tom informal
  - "mudanca_processo": envolve mudança de hábito/processo observável ao longo do tempo (ex: "rever processo de code review")
  - "pdi": relacionada ao Plano de Desenvolvimento Individual
- "prazo_iso": YYYY-MM-DD se mencionado, null se não
- "origem_pauta": quem originou o sinal que tornou o tema relevante — "liderado" se foi iniciativa ou percepção própria dele, "gestor" se foi sugestão ou observação do gestor, "terceiro" se veio de feedback ou impacto explicitamente atribuído a outra pessoa. Atenção: se o liderado confessou um problema mas atribuiu as consequências ou o impacto a um colega nomeado (ex: "ficou na conta do Antônio", "o Antônio reclamou"), use "terceiro" — o sinal de origem é a experiência do colega, não a confissão em si.
- "terceiro_nome": nome de quem originou o sinal, se origem_pauta = "terceiro"
- "contexto": 1 frase dizendo onde na conversa surgiu (para o gestor validar)

**"acoes_gestor"** — Ações que o gestor se comprometeu a fazer:
- "descricao": o que o gestor prometeu fazer, acionável e autônoma
- "prazo_iso": YYYY-MM-DD se mencionado, null se não

**"sugestoes_gestor"** — Sugestões do gestor e reação do liderado:
Quando o gestor faz sugestão e o liderado responde:
- Afirmativamente ("total", "aham", "é", "faz sentido", "pode ser") sem rejeitar → "aceitou_tacito", gerar_acao: true
- Com aceitação explícita ("vou fazer", "combinado") → "aceitou_explicito", gerar_acao: true
- Com resistência ("não sei", "acho difícil", "não concordo") → "resistiu", gerar_acao: false
- Sem conclusão clara → "ficou_em_aberto", gerar_acao: false
Quando gerar_acao = true, gere a ação correspondente em "acoes_liderado" com origem_pauta: "gestor".
Atenção — "já anotei" NÃO cancela gerar_acao: O liderado pode dizer "já tô tentando", "já anotei" ou expressão similar ANTES de o gestor detalhar o COMO. Isso não significa que a ação já existe como compromisso estruturado. Se o gestor, mesmo após essa fala, apresentou uma sugestão concreta (método, ferramenta, processo), registre normalmente a sugestão e gere a ação — a resposta do liderado à sugestão específica do gestor é o que determina gerar_acao, não a reação prévia genérica.
Atenção — sugestões em lista: Se o gestor apresentou múltiplas sugestões em sequência (ex: "você pode revisar o processo, criar guardias e gerar uma persona de revisão"), trate cada uma como uma sugestão separada em "sugestoes_gestor" e, quando gerar_acao = true, gere uma ação distinta por item em "acoes_liderado". Não consolide num único registro vago. Se o liderado aceitou o bloco inteiro com uma resposta afirmativa, aplique a mesma resposta_liderado a cada sugestão individual.

**"insights_1on1"** — Insights qualitativos:
Capture momentos de alinhamento que NÃO são ações: carreira, expectativas, feedback informal, preocupações pessoais, mudanças de processo.
- "categoria": carreira | pdi | expectativas | feedback_dado | feedback_recebido | relacionamento | pessoal | processo
- "conteudo": legível por alguém que não leu a transcrição, daqui a 3 meses. Auto-contido.
- "relevancia": "alta" para decisões, alinhamentos críticos, mudanças de direção. "media" para contexto útil.
- "acao_implicita": se o insight sugere uma ação futura não capturada explicitamente, descreva-a. null se não.

**"correlacoes_terceiros"** — Correlação com sinais de terceiros:
Compare o conteúdo do 1:1 com os sinais de terceiros fornecidos acima.
- Se o liderado confirmar, endossar ou contradizer qualquer sinal, registre.
- Convergência de fontes é o sinal mais forte para o gestor.
- Array vazio se não há sinais de terceiros ou nenhuma correlação detectada.

**"tendencia_emocional"** — Compare sentimento e engajamento deste 1:1 com o histórico de saúde:
- "estavel": sem mudança significativa
- "melhorando": sinais positivos comparados ao histórico recente
- "deteriorando": SOMENTE quando há evidência de piora NESTE 1:1 E na última entrada do histórico de saúde. Um único 1:1 ruim nunca é suficiente para "deteriorando" — use "novo_sinal" nesses casos. REGRA ADICIONAL: se o histórico de saúde tem menos de 2 entradas de 1:1 (contagem atual: ${contagem1on1s}), NUNCA use "deteriorando" — use "novo_sinal" obrigatoriamente
- "novo_sinal": sinal emocional sem precedente no histórico, ou única evidência de piora sem confirmação histórica
"nota_tendencia": 1-2 frases explicando a avaliação. Se "deteriorando", cite explicitamente as 2+ evidências consecutivas.

**"pdi_update"** — Menção ao PDI:
- "houve_mencao_pdi": true se PDI, carreira ou desenvolvimento foram mencionados
- "objetivos_mencionados": objetivos do PDI (do config.yaml) que foram citados
- "novo_objetivo_sugerido": se um novo objetivo de PDI foi sugerido, descreva. null se não
- "progresso_observado": evidência concreta de progresso em algum objetivo. null se nenhuma

**"prioridade_atualizada"** — Atualizacao de prioridade das acoes abertas:
Analise as acoes abertas fornecidas. Se o contexto do 1:1 revela urgencia nova (prazo apertado, bloqueio, pedido explicito) ou reduz urgencia (ja resolvido parcialmente, contexto mudou), inclua em prioridade_atualizada.

## Prioridade de acoes
Analise as acoes abertas fornecidas. Se o contexto do 1:1 revela urgencia nova (prazo apertado, bloqueio, pedido explicito) ou reduz urgencia (ja resolvido parcialmente, contexto mudou), inclua em prioridade_atualizada. Retorne array vazio se nenhuma mudanca necessaria.

**"auto_percepcao"** — Como o liderado se vê em relação ao feedback que recebe:
Avalie com base no que o liderado disse sobre seu próprio desempenho, comparando com o que o gestor observa (histórico do perfil, ações abertas, sinais de terceiros):
- "alinhada_com_feedback": o liderado reconhece pontos de melhoria e conquistas de forma consistente com o que o gestor observa
- "cega": o liderado não percebe problemas que são evidentes no histórico ou para o gestor — não os menciona, minimiza ou não demonstra consciência de seu impacto
- "inflacionada_positivamente": o liderado superestima seu desempenho ou contribuição de forma desconectada das evidências disponíveis
- null: não há evidências suficientes neste 1:1 para avaliar (liderado não tocou no tema, 1:1 foi muito operacional)
IMPORTANTE: Este campo é para uso interno do gestor — NÃO vai para o resumo_executivo_rh.

**"resumo_executivo_rh"** — Resumo executivo para Qulture Rocks:
Ata limpa, autônoma e pronta para colar no Qulture Rocks e compartilhar com o liderado. Deve ser legível por alguém que não esteve presente na reunião.

Estrutura obrigatória — use exatamente estas seções na ordem abaixo:

1. Parágrafo de abertura (2-3 frases): tópicos principais discutidos na reunião, sem análise interna.
2. **Ações do liderado** — bullets com •, uma linha por ação, formato: "• [Nome do liderado]: [ação concreta]". Incluir apenas ações novas surgidas neste 1:1; omitir follow-ups de ciclos anteriores.
3. **Ações do gestor** — bullets com •, uma linha por ação, formato: "• [Nome do gestor]: [ação concreta]". Incluir apenas ações que o gestor se comprometeu explicitamente.
4. **Próximos passos** — bullets com •: temas ou decisões que serão acompanhados no próximo 1:1.

Tom: profissional, direto, sem jargão interno do app.
OMITIR obrigatoriamente: tendência emocional, insights de carreira/PDI, análise qualitativa interna, sinais sensíveis, saúde emocional — nada que seja inadequado para registro formal de RH ou para o liderado ler.
PRIVACIDADE OBRIGATÓRIA: Se o 1:1 tocou temas pessoais, saúde, família, situação financeira ou qualquer dado sensível, use exclusivamente a fórmula: "Temas pessoais: alinhados. Continuaremos acompanhando." — nunca descreva o conteúdo, mesmo que de forma genérica.
Se não houver ações do liderado ou do gestor neste 1:1, omitir a seção correspondente (não gerar bullets vazios).

## Exemplo de output esperado

Para um 1:1 onde havia 1 ação aberta do liderado, o gestor fez uma sugestão de processo, e houve menção ao PDI:

\`\`\`json
{
  "followup_acoes": [
    {"acao_original": "Investigar causa raiz da lentidão no endpoint de auth", "acao_id": "act-001", "status": "em_andamento", "evidencia": "Ana mencionou que identificou o gargalo no middleware de validação de tokens e está testando uma solução com cache de sessões"}
  ],
  "acoes_liderado": [
    {"descricao": "Implementar cache de sessões no middleware de auth e medir impacto na latência P95", "tipo": "tarefa_explicita", "prazo_iso": "2026-04-04", "origem_pauta": "liderado", "terceiro_nome": null, "contexto": "Surgiu quando Ana explicou a solução que está testando para o gargalo de auth"}
  ],
  "acoes_gestor": [
    {"descricao": "Alinhar com time de infra sobre limites de memória do cache de sessões antes da implementação", "prazo_iso": null}
  ],
  "insights_1on1": [
    {"categoria": "carreira", "conteudo": "Ana expressou interesse em assumir ownership do módulo de auth completo — quer ser referência técnica do time nessa área", "relevancia": "alta", "acao_implicita": "Avaliar se ownership do módulo de auth pode ser formalizado como objetivo de PDI"}
  ],
  "sugestoes_gestor": [
    {"descricao": "Documentar a arquitetura do middleware de auth para facilitar onboarding de novos membros", "resposta_liderado": "aceitou_tacito", "gerar_acao": true}
  ],
  "correlacoes_terceiros": [],
  "tendencia_emocional": "estavel",
  "nota_tendencia": "Engajamento consistente com os últimos 1:1s. Ana demonstra energia positiva com a investigação técnica e interesse em crescer na área de auth.",
  "pdi_update": {
    "houve_mencao_pdi": true,
    "objetivos_mencionados": ["Desenvolver expertise em segurança e autenticação"],
    "novo_objetivo_sugerido": null,
    "progresso_observado": "Está liderando a investigação do gargalo de auth com autonomia — demonstra aprofundamento técnico na área"
  },
  "resumo_executivo_rh": "Reunião focada no progresso da investigação de performance do serviço de autenticação e no interesse de Ana em expandir sua atuação nessa área.\\n\\n• Ana Lima: implementar cache de sessões no middleware de auth e medir impacto na latência P95 até 04/04\\n• Ana Lima: documentar arquitetura do middleware de auth\\n\\n• ${gestorLabel}: alinhar com time de infra sobre limites de memória do cache\\n\\n• Próximos passos:\\n• Acompanhar resultado da implementação do cache de sessões\\n• Avaliar formalização do ownership do módulo de auth",
  "auto_percepcao": "alinhada_com_feedback",
  "prioridade_atualizada": []
}
\`\`\`

JSON esperado:
{
  "followup_acoes": [
    {"acao_original": "string", "acao_id": "string", "status": "cumprida|em_andamento|nao_mencionada|abandonada", "evidencia": "string ou null"}
  ],
  "acoes_liderado": [
    {"descricao": "string", "tipo": "tarefa_explicita|compromisso_informal|mudanca_processo|pdi", "prazo_iso": "YYYY-MM-DD ou null", "origem_pauta": "liderado|gestor|terceiro", "terceiro_nome": "string ou null", "contexto": "string"}
  ],
  "acoes_gestor": [
    {"descricao": "string", "prazo_iso": "YYYY-MM-DD ou null"}
  ],
  "insights_1on1": [
    {"categoria": "carreira|pdi|expectativas|feedback_dado|feedback_recebido|relacionamento|pessoal|processo", "conteudo": "string", "relevancia": "alta|media", "acao_implicita": "string ou null"}
  ],
  "sugestoes_gestor": [
    {"descricao": "string", "resposta_liderado": "aceitou_explicito|aceitou_tacito|resistiu|ficou_em_aberto", "gerar_acao": true}
  ],
  "correlacoes_terceiros": [
    {"sinal_original": "string", "fonte": "string", "confirmado_pelo_liderado": true, "contexto_confirmacao": "string ou null"}
  ],
  "tendencia_emocional": "estavel|melhorando|deteriorando|novo_sinal",
  "nota_tendencia": "string",
  "pdi_update": {
    "houve_mencao_pdi": true,
    "objetivos_mencionados": ["string"],
    "novo_objetivo_sugerido": "string ou null",
    "progresso_observado": "string ou null"
  },
  "resumo_executivo_rh": "string",
  "auto_percepcao": "alinhada_com_feedback|cega|inflacionada_positivamente|null",
  "prioridade_atualizada": [
    {
      "acao_id": "id da acao existente",
      "nova_prioridade": "baixa | media | alta",
      "motivo": "razao para mudar prioridade baseada no contexto do 1:1"
    }
  ]
}`
}
