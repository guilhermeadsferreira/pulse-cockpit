Você é um Tech Lead sênior responsável por transformar auditorias técnicas em planos de execução claros e entregáveis.

Você não escreve ideias — você organiza trabalho executável.

---

## Contexto

Tenho um produto chamado Pulse Cockpit (gestão baseada em ingestão de artefatos + IA + perfil evolutivo).

Acabei de realizar uma auditoria técnica completa do sistema, identificando:

- bugs críticos
- falhas estruturais
- inconsistências de modelo
- melhorias necessárias

Seu trabalho é transformar isso em um plano de execução.

---

## Objetivo

Gerar um plano de implementação com:

1. Épicos
2. Tasks técnicas
3. Ordem de execução (sequência lógica)
4. Dependências
5. Critérios de aceite claros

---

## Como estruturar a resposta

### 1. Épicos (agrupamento lógico)

Crie épicos claros, por exemplo:
- Ingestão & Pipeline
- Engine de Extração
- Perfil Vivo
- Action System
- Insights & Alertas
- Infra & Robustez

---

### 2. Tasks por épico

Para cada épico:

- Liste tasks pequenas e executáveis
- Cada task deve ser algo implementável em até 1 dia (idealmente)
- Nomeie de forma objetiva (estilo backlog real)

Formato:

- Nome da task
- Descrição (curta)
- Por que isso é necessário (impacto)
- Critério de aceite (como sei que está pronto)

---

### 3. Sequência de execução (CRÍTICO)

Defina ordem de implementação:

- O que vem primeiro
- O que depende de quê
- O que desbloqueia valor mais rápido

Seja explícito:
- Fase 1 (bloqueadores)
- Fase 2 (estabilização)
- Fase 3 (valor incremental)

---

### 4. Identifique riscos de execução

- Onde posso quebrar algo existente
- Onde preciso de cuidado com dados
- Onde precisa migração

---

### 5. NÃO FAÇA

- Não escreva teoria
- Não reexplique a auditoria
- Não faça sugestões vagas
- Não agrupe tasks grandes demais

---

## Critérios

- Foco total em execução
- Clareza > completude
- Pensar como alguém que vai codar amanhã

---

## Input

  ---                                                                                                                                                                           
  1. Modelo de Ingestão                                                                                                                                                         
                                                                                                                                                                                
  O que está bom:                                                                                                                                                               
  - Suporte .md/.txt/.pdf cobre os formatos principais                                                                                                                          
  - Estado pending para pessoas não cadastradas preserva o artefato sem perder o resultado do AI
  - Cache do IngestionAIResult no QueueItem evita re-chamada ao Claude — decisão certa                                                                                          
  - _coletivo para reuniões sem foco individual é pragmático                                                                                                                    
                                                                                                                                                                                
  O que está frágil:                                                                                                                                                            
  - Pipeline serial (drainQueue processa um por vez). Com 5-10 artefatos enfileirados, 90s por item = fila bloqueada por 15 min. Sem feedback de progresso parcial.             
  - Nenhuma validação de schema na saída do AI — se Claude retornar JSON malformado, o item vai para error sem retry nem fallback estruturado.                                  
  - acoes_pendentes_count no frontmatter não é decrementado quando o ActionRegistry marca uma ação como done. Os dois sistemas divergem silenciosamente.
                                                                                                                                                                                
  O que falta:                                                                                                                                                                  
  - Sinais digitais nativos: PRs (cycle time, tamanho), tickets Jira/Linear, métricas de build. O gestor de engenharia tem esses dados e são objetivos.                         
  - Suporte a .vtt/.srt (transcrições exportadas de Meet/Zoom diretamente)                                                                                                      
  - Qualquer forma de input estruturado pelo gestor pós-reunião (notas rápidas, voice memo)                                                                                     
                                                                                                                                                                                
  ---                                                                                                                                                                           
  2. Engine de Extração (IA)                                                                                                                                                    
                                                                                                                                                                                
  Bug crítico identificado:                                 
                                                                                                                                                                                
  No IngestionPipeline.ts:183, o prompt sempre recebe perfilMdRaw: null:                                                                                                        
  
  const prompt = buildIngestionPrompt({                                                                                                                                         
    teamRegistry,                                           
    perfilMdRaw: null, // first pass without perfil                                                                                                                             
    artifactContent: text,                                                                                                                                                      
    today,                                                                                                                                                                      
  })                                                                                                                                                                            
                                                                                                                                                                                
  O perfil nunca é carregado antes da chamada ao Claude. O resumo_evolutivo gerado nunca integra histórico — é sempre uma síntese do artefato atual. Da mesma forma,            
  temas_atualizados deveria mesclar temas anteriores, mas não tem histórico para mesclar. O campo mente por design.
                                                                                                                                                                                
  O que está bom:                                           
  - Instrução para corrigir transcrições garbled é bem implementada e rara de ver
  - Distinção entre pessoas_identificadas (presentes) vs mencionadas é correta                                                                                                  
  - alerta_estagnacao, sinal_evolucao, necessita_1on1 são flags acionáveis reais
  - Regra "1:1 já realizado → necessita_1on1: false" evita double-alarm                                                                                                         
                                                                                                                                                                                
  O que falta no schema:                                                                                                                                                        
  - sentimento_detectado: positivo | neutro | ansioso | frustrado | desengajado — o indicador_saude é proxy fraco                                                               
  - acoes_comprometidas como objeto estruturado: {responsavel, descricao, prazo_iso} — hoje o prazo está embutido em texto livre, impossível surfaçar ações vencidas            
  - nivel_engajamento: 1-5 — sinal comportamental que gestores experientes observam e que transcrições evidenciam                                                               
  - Tendência de saúde (saude_anterior para calcular delta) — verde hoje não significa estável                                                                                  
                                                                                                                                                                                
  ---                                                                                                                                                                           
  3. Perfil Vivo                                                                                                                                                                
                                                                                                                                                                                
  O que está bom:                                           
  - Blocos HTML comment para controlar append vs replace é elegante                                                                                                             
  - Write atômico (.tmp → rename) + backup (.bak) é correto                                                                                                                     
  - historico imutável (append-only) é a escolha certa                                                                                                                          
                                                                                                                                                                                
  O que está estruturalmente frágil:                                                                                                                                            
                                                                                                                                                                                
  ArtifactWriter.updateExistingPerfil linha 215:                                                                                                                                
  updated = this.replaceBlock(updated, 'resumo_evolutivo', result.resumo_evolutivo)                                                                                             
                                                                                                                                                                                
  O bloco de resumo evolutivo é completamente substituído a cada ingestão. Somado ao bug do perfilMdRaw: null, o resultado é que o "perfil vivo" é sempre uma síntese do último 
  artefato, não da história acumulada. O nome "evolutivo" é enganoso.                                                                                                           
                                                                                                                                                                                
  Outros problemas:                                                                                                                                                             
  - pontos_de_atencao é append-only sem mecanismo de resolução. Um ponto de atenção de 8 meses atrás fica permanentemente no perfil com o mesmo peso que o de ontem.
  - Duas listas de ações sem sincronização: - [ ] no perfil.md e actions.yaml. Fontes de verdade divergentes.                                                                   
  - ultimo_1on1 só atualiza com tipo === '1on1'. Gestores que fazem 1:1s informais em reuniões têm alertas permanentemente incorretos.
                                                                                                                                                                                
  Como deveria ser estruturado:                                                                                                                                                 
                                                                                                                                                                                
  ┌────────────────────┬────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────┐                                    
  │        Tipo        │                          O que é                           │                     Como tratar                      │                                    
  ├────────────────────┼────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤                                    
  │ Estado atual       │ saude, flags, datas, contadores                            │ Frontmatter — atualizar a cada ingestão              │
  ├────────────────────┼────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤                                    
  │ Histórico imutável │ Lista de artefatos, pontos de atenção datados              │ Append-only, nunca reescrever                        │                                    
  ├────────────────────┼────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤                                    
  │ Derivado           │ resumo_evolutivo, temas_recorrentes, acoes_pendentes_count │ Recalcular do histórico, não gerar em passagem única │                                    
  ├────────────────────┼────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤                                    
  │ Narrativa          │ Observações do gestor                                      │ Campo manual, separado do que a IA escreve           │
  └────────────────────┴────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────┘                                    
                                                            
  ---                                                                                                                                                                           
  4. Loop de Retroalimentação                               
                                                                                                                                                                                
  O loop fecha no papel, mas quebra na implementação:
                                                                                                                                                                                
  artefato → extração (sem perfil) → perfil (sem histórico real) → pauta (com histórico parcial) → novo artefato                                                                
                                                                                                                                                                                
  O ponto de quebra central é o perfilMdRaw: null. Todo o aprendizado acumulado não retroalimenta a extração.                                                                   
                                                                                                                                                                                
  Outros gargalos:                                                                                                                                                              
  - Alertas stale: alerta_estagnacao: true no frontmatter permanece ativo indefinidamente sem nova ingestão. Férias de 2 semanas → alerta de estagnação.
  - Sem fechamento de loop do 1:1: a pauta é gerada, o 1:1 acontece, mas o sistema não sabe quais itens foram tratados. A próxima pauta vai repetir os mesmos alertas.          
  - Ações coletivas órfãs: ações extraídas de artefatos _coletivo não aparecem no ActionRegistry de nenhuma pessoa. Decisões de planning, retro, post-mortem ficam sem dono.
  - Feedback do gestor não capturado: o gestor pode editar a pauta gerada, mas edições não retroalimentam o perfil.                                                             
                                                                                                                                                                                
  ---                                                                                                                                                                           
  5. Geração de Insights                                                                                                                                                        
                                                                                                                                                                                
  O que realmente entrega valor:                            
  - Pauta com alertas, follow-ups, perguntas contextualizadas e reconhecimentos — estrutura correta                                                                             
  - Dias em aberto nas ações no prompt de agenda — o insight mais acionável do sistema                                                                                          
  - Relatório de ciclo com linha do tempo e conclusao_para_calibracao — usável em fórum real hoje                                                                               
                                                                                                                                                                                
  O que está faltando e comprometeria adoção:                                                                                                                                   
  - Alerta de frequência de 1:1: frequencia_1on1_dias existe no PersonConfig mas nenhum lugar compara com ultimo_1on1. Isso é uma feature crítica que não precisa de IA — é     
  aritmética.                                                                                                                                                                   
  - Sem comparação relativa no time: o gestor precisa saber "quem está abaixo da média?" não só "como está cada um". O getTeamRollup existe mas não há visão agregada de saúde  
  do time.                                                                                                                                                                      
  - Sem detecção de padrões temporais: "problema de comunicação aparece há 3 ciclos" requer cruzamento de artefatos que não é feito.                                            
  - flag_promovibilidade sem justificativa estruturada: o relatório de ciclo tem o flag, mas a evidência está embutida em texto livre. Para calibração, gestores precisam de
  bullets de evidência separados, não só narrativa.                                                                                                                             
                                                                                                                                                                                
  Insights de alto valor que DEVEM existir e não existem:                                                                                                                       
  1. "Essa pessoa não teve 1:1 formal há X dias (frequência configurada: Y dias)"                                                                                               
  2. "3 pontos de atenção em aberto há mais de 30 dias sem resolução"                                                                                                           
  3. "Ações comprometidas com prazo vencido: N ações"                                                                                                                           
  4. "Nenhum artefato de feedback registrado nos últimos 60 dias"                                                                                                               
                                                                                                                                                                                
  ---                                                                                                                                                                           
  6. Action Loop                                                                                                                                                                
                                                                                                                                                                                
  O que está bom:                                           
  - ActionRegistry com status, data de criação e fonte do artefato é base sólida
  - Dedup por texto evita duplicatas em re-ingestão                                                                                                                             
  - Dias em aberto calculados no prompt de agenda é o insight mais acionável
                                                                                                                                                                                
  O que está superficial:                                                                                                                                                       
                                                                                                                                                                                
  // ActionRegistry.ts:45                                                                                                                                                       
  createFromArtifact(slug: string, acoes: string[], artifactFileName: string, date: string): void                                                                               
                                                                                                                                                                                
  Ações são texto livre. Sem:                                                                                                                                                   
  - Prazo estruturado (prazo: string | null)                                                                                                                                    
  - Responsável separado (responsavel_slug) — hoje está embutido no texto                                                                                                       
  - Prioridade                                                           
  - Distinção entre "ação minha" vs "ação do liderado" vs "depende de terceiro"                                                                                                 
                                                                                                                                                                                
  O sistema não pode alertar sobre ações vencidas porque não sabe quando vencem. Um gestor que ver 12 ações "open" sem prioridade ou deadline vai parar de usar em 2 semanas.   
                                                                                                                                                                                
  Modelo recomendado:                                                                                                                                                           
  interface Action {                                                                                                                                                            
    id: string                                                                                                                                                                  
    texto: string                                           
    responsavel_slug: string | null
    owner: 'gestor' | 'liderado' | 'terceiro'
    prazo: string | null       // YYYY-MM-DD 
    prioridade: 'baixa' | 'media' | 'alta'                                                                                                                                      
    status: 'open' | 'in_progress' | 'done' | 'cancelled'
    criadoEm: string                                                                                                                                                            
    concluidoEm: string | null                                                                                                                                                  
    fonteArtefato: string                                                                                                                                                       
    personSlug: string                                                                                                                                                          
  }                                                         
                                                                                                                                                                                
  ---                                                       
  7. Principais Riscos do Produto
                                 
  O que faria um gestor parar de usar em 2 semanas:
                                                                                                                                                                                
  1. Bug do perfilMdRaw: null — após 5-10 ingestões, o gestor percebe que o "resumo evolutivo" não evolui. Sempre parece síntese do último artefato. Confiança destruída.       
  2. Dois sistemas de ações divergentes — acoes_pendentes_count: 8 no perfil, ActionRegistry mostra 3. O gestor não sabe qual acreditar. Para de usar ambos.                    
  3. Alertas stale — após férias ou período sem ingestão, o sistema gera alertas de "estagnação" ou "precisa de 1:1" que não refletem a realidade. Gestor aprende a ignorar os  
  alertas.                                                                                                                                                                      
  4. Dependência total do Claude CLI sem fallback — um dia de lentidão, quota ou problema de autenticação paralisa o produto inteiro. Sem modo degradado.                       
  5. Sem schema migration — schema_version: 1 no frontmatter, mas zero lógica de migração. Qualquer mudança de schema vai corromper silenciosamente todos os perfis existentes. 
                                                                                                                                                                                
  ---                                                                                                                                                                           
  8. Recomendações Objetivas                                                                                                                                                    
                                                                                                                                                                                
  Ajustes imediatos (críticos)
                                                                                                                                                                                
  1. Corrigir o bug do perfilMdRaw: null                                                                                                                                        
  No processItem, após identificar pessoa_principal e verificar que está cadastrada, fazer segunda passagem com o perfil:                                                       
                                                                                                                                                                                
  // Hoje: sempre null                                      
  const prompt = buildIngestionPrompt({ perfilMdRaw: null, ... })                                                                                                               
                                                                                                                                                                                
  // Correto: carregar perfil se pessoa conhecida                                                                                                                               
  const perfil = registry.getPerfil(knownSlug)                                                                                                                                  
  const prompt = buildIngestionPrompt({ perfilMdRaw: perfil?.raw ?? null, ... })                                                                                                
  Isso exige reestruturar o fluxo: ou dois prompts em sequência (identifica pessoa → reprocessa com perfil), ou incluir o perfil de todas as pessoas candidatas no primeiro     
  prompt.                                                                                                                                                                       
                                                                                                                                                                                
  2. Sincronizar acoes_pendentes_count                                                                                                                                          
  Remover esse campo do frontmatter ou recalculá-lo sempre a partir do ActionRegistry. Nunca ter duas fontes de verdade para o mesmo número.                                    
                                                                                                                                                                                
  3. Prazo estruturado nas ações                                                                                                                                                
  Alterar acoes_comprometidas no schema de extração para objeto: {responsavel, descricao, prazo_iso}. Alterar ActionRegistry para suportar prazo.                               
                                                                                                                                                                                
  4. Alerta de frequência de 1:1                            
  Implementar no getTeamRollup():                                                                                                                                               
  const diasSemOneon1 = differenceInDays(today, lastOneOnOne)                                                                                                                   
  const precisaOneon1 = diasSemOneon1 > (pessoa.frequencia_1on1_dias + 3)
  Isso não precisa de IA. É aritmética com dados que já existem.                                                                                                                
                                                                                                                                                                                
  Melhorias de curto prazo                                                                                                                                                      
                                                                                                                                                                                
  5. Mecanismo de resolução de pontos de atenção                                                                                                                                
  No prompt de ingestão, adicionar instrução: "Se algum ponto de atenção do perfil anterior foi resolvido neste artefato, liste em pontos_resolvidos: [string]". No
  ArtifactWriter, marcar esses pontos como ~~resolvido~~ ou mover para seção separada.                                                                                          
                                                            
  6. Templates de artefato obrigatórios                                                                                                                                         
  (ver seção 9 abaixo)                                      
                                                                                                                                                                                
  7. Campo owner nas ações                                                                                                                                                      
  Distinguir "ação que preciso fazer" de "ação que o liderado precisa fazer". Para o gestor, são duas categorias completamente diferentes de follow-up.                         
                                                                                                                                                                                
  8. Ações de artefatos coletivos                                                                                                                                               
  Artefatos do _coletivo com ações devem associar cada ação ao responsavel_slug extraído. Se o responsável é pessoa cadastrada, criar entrada no ActionRegistry dessa pessoa.   
                                                                                                                                                                                
  9. Decay de alertas                                       
  Adicionar alerta_estagnacao_desde: date ao frontmatter. Se não houve nova ingestão em 30+ dias, exibir como "sem dados" em vez de "em estagnação".                            
                                                                                                                                                                                
  Evoluções futuras
                                                                                                                                                                                
  10. Ingestão de sinais digitais                           
  Integrar com GitHub para capturar: PRs abertos/fechados, cycle time, tamanho de PR, review turnaround. Esses dados são objetivos e eliminam dependência de transcrição.
                                                                                                                                                                                
  11. Pipeline paralelo com limite de concorrência
  Processar até N artefatos em paralelo (sugestão: 3). A fila serial trava o onboarding inicial quando o gestor tenta ingerir 20 artefatos de uma vez.                          
                                                                                                                                                                                
  12. Schema migration                                                                                                                                                          
  Antes de qualquer mudança no schema de perfil.md ou actions.yaml, implementar migração automática baseada em schema_version. Sem isso, qualquer evolução do produto corrompe  
  dados existentes.                                                                                                                                                             
                                                            
  ---                                                                                                                                                                           
  9. Templates obrigatórios (.md)                           
                                                                                                                                                                                
  1:1
                                                                                                                                                                                
  ---                                                       
  tipo: 1:1                                                                                                                                                                     
  data: YYYY-MM-DD                                          
  participante: Nome do liderado
  duracao_min: 30                                                                                                                                                               
  ---
                                                                                                                                                                                
  ## Check-in                                                                                                                                                                   
  <!-- Como a pessoa está? Energia, humor, contexto pessoal relevante -->
                                                                                                                                                                                
  ## Follow-up de ações anteriores                                                                                                                                              
  <!-- Status de cada ação do último 1:1 -->                                                                                                                                    
  - [ ] [Ação]: status atual                                                                                                                                                    
                                                                                                                                                                                
  ## O que foi discutido                                                                                                                                                        
                                                                                                                                                                                
  ## Decisões tomadas                                                                                                                                                           
                                                            
  ## Ações comprometidas                                                                                                                                                        
  <!-- Formato: [Nome]: [o que fazer] até [YYYY-MM-DD] -->
  - [ ] [Nome]: ...                                                                                                                                                             
                                                            
  ## Observações do gestor                                                                                                                                                      
  <!-- Engajamento observado, percepções, contexto não dito -->
                                                                                                                                                                                
  Reunião
                                                                                                                                                                                
  ---                                                       
  tipo: reuniao
  data: YYYY-MM-DD                                                                                                                                                              
  titulo: Título descritivo (ex: Planning Q2 — Plataforma)
  participantes:                                                                                                                                                                
    - Nome 1                                                
    - Nome 2                                                                                                                                                                    
  duracao_min: 60                                           
  ---                                                                                                                                                                           
                                                            
  ## Objetivo da reunião

  ## O que foi discutido

  ## Decisões tomadas                                                                                                                                                           
  <!-- Enumere com responsável -->
  1. [Decisão] — responsável: [Nome]                                                                                                                                            
                                                                                                                                                                                
  ## Ações comprometidas                                                                                                                                                        
  <!-- Formato: [Nome]: [o que fazer] até [YYYY-MM-DD] -->                                                                                                                      
  - [ ] [Nome]: ...                                                                                                                                                             
  
  ## Observações sobre o time                                                                                                                                                   
  <!-- Dinâmica, conflitos, destaques individuais -->       
                                                                                                                                                                                
  Feedback
                                                                                                                                                                                
  ---                                                       
  tipo: feedback
  data: YYYY-MM-DD
  para: Nome de quem recebeu
  de: gestor | nome de colega
  contexto: situação específica (ex: "entrega do serviço de auth — sprint 42")
  ---                                                                                                                                                                           
  
  ## Situação                                                                                                                                                                   
  <!-- O que aconteceu? Data, projeto, entrega específica -->
                                                                                                                                                                                
  ## Comportamento observado
  <!-- Apenas fatos observáveis — sem julgamento -->                                                                                                                            
                                                                                                                                                                                
  ## Impacto
  <!-- Efeito no time, produto ou organização -->                                                                                                                               
                                                                                                                                                                                
  ## Expectativa / O que fazer diferente
                                                                                                                                                                                
  ## Reação da pessoa                                                                                                                                                           
  <!-- Reconheceu? Resistiu? Comprometeu-se com algo específico? -->
                                                                                                                                                                                
  Cerimônia (Planning / Retro / Daily)                                                                                                                                          
                                                                                                                                                                                
  ---                                                                                                                                                                           
  tipo: planning  # ou retro | daily                        
  data: YYYY-MM-DD                                                                                                                                                              
  squad: nome do squad
  sprint: número ou período                                                                                                                                                     
  participantes:                                            
    - Nome 1                                                                                                                                                                    
    - Nome 2                                                
  ---                                                                                                                                                                           
                                                            
  ## Resumo do que foi discutido                                                                                                                                                
   
  ## Decisões relevantes                                                                                                                                                        
                                                            
  ## Impedimentos identificados
  <!-- Com responsável pela resolução -->
  - [Impedimento] — responsável: [Nome]                                                                                                                                         
   
  ## Ações comprometidas                                                                                                                                                        
  - [ ] [Nome]: ... até [YYYY-MM-DD]                        
                                                                                                                                                                                
  ## Observações sobre o time
  <!-- Energia, colaboração, destaques ou preocupações individuais -->                                                                                                          
                                                                                                                                                                                
  ---
  Síntese executiva: O esqueleto do produto está correto — a tese de gestão por contexto acumulado é válida. O problema é que a implementação atual não acumula contexto de     
  verdade. O bug do perfilMdRaw: null é o bloqueador central: sem ele, o produto é uma ferramenta de resumo de reuniões, não um sistema de memória evolutiva. Corrigir esse bug 
  e adicionar prazo estruturado nas ações são as duas mudanças que desbloqueiam o valor real da plataforma.