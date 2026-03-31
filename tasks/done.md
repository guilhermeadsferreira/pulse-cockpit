# Done — Pulse Cockpit

> Última atualização: 2026-03-31 (auditoria Wave 0)

## Wave 0 — Auditoria: tasks já implementadas ✓ (2026-03-31)

> Confirmadas por exploração do codebase — nunca haviam sido fechadas no backlog.

### Fase 3 — UX do Gestor (restante)
- **T-R4.4** Narrativa do resumo evolutivo preservada — `ProfileCompressor` agora lê bloco `Resumos Anteriores` e passa `resumosAnteriores` para `buildCompressionPrompt`
- **T-R10.1** Dashboard urgências do dia — `UrgenciasHoje()` já implementado em `DashboardView.tsx` com 3 tipos (1:1, ação vencendo, saúde vermelha)
- **T-R10.3** Stale data alert bar — banner já presente com `staleCount` calculado via `dados_stale` do frontmatter
- **T-R10.6** Cycle report defaults inteligentes — `CycleReportView.tsx` já tem botões "Últimos 90 dias", "Último trimestre", "Últimos 6 meses"
- **T-R10.7** Campo `contexto` das ações visível — `ActionRow()` já renderiza `a.contexto` como texto secundário
- **T-R10.8** Botão "Gerar Sprint" — `RelatoriosView.tsx` já tem botão Sprint com `handleRefreshSprint()`
- **T-R9.1** Ação → artefato fonte (link bidirecional) — campo `fonteArtefato` existe e é link clicável; `ActionRegistry.createFromArtifact()` popula campo

### Fase 3 — Pipeline e feedback loops
- **T-R7.1** External data timing — `ExternalDataPass.run()` já é chamado sincronamente **antes** do deep pass em `run1on1DeepPass()`, com comentário explícito (T-R7.1)
- **T-R7.2** Demandas do gestor na pauta — `buildAgendaPrompt` já recebe `demandasGestor`; `DemandaRegistry` carregado antes da chamada em `index.ts`
- **T-R7.5** Frontmatter health transitions — `saude_anterior` rastreia transição; `Histórico de Saúde` acumula todas as entradas; considerado adequado

### Fase 4 — Prompt Refinements (R6) já presentes
- **T-R6.1** `pessoas_identificadas` vs mencionadas — instrução explícita no prompt de ingestão
- **T-R6.3** `temas_detectados` vs `temas_atualizados` — ambos campos com distinção clara
- **T-R6.5** Profundidade de compreensão — campo `confianca` (alta/media/baixa) implementado
- **T-R6.6** Follow-up patterns parciais — campo `followup_acoes` com 4 status incluindo `nao_mencionada`
- **T-R6.7** Correlações não abordadas — campo `correlacoes_terceiros` com `confirmado_pelo_liderado`
- **T-R6.8** PDI drift detection — campo `pdi_update` com `houve_mencao_pdi`, `progresso_observado`
- **T-R6.10** Resumo RH sem dados sensíveis — instrução explícita de omissão no `1on1-deep.prompt.ts`
- **T-R6.12** Escuta ativa como soft skill — campo `soft_skills_observadas` com exemplo explícito
- **T-R6.13** Feedback com atribuição completa — padrão obrigatório [QUEM]+[FEZ O QUÊ]+[IMPACTO]
- **T-R6.15** `ciclos_sem_mencao` → dias em aberto — campo `ciclos_sem_mencao` + `daysOpen` calculado em `agenda.prompt.ts`
- **T-R6.16** Temas vs follow-ups: distinção clara — campos separados com regras distintas
- **T-R6.22** Temas: vocabulário controlado max 8 — instrução explícita no `compression.prompt.ts`
- **T-R6.30** `origem_pauta`: 3 opções claras — campo com valores `liderado|gestor|terceiro`

### Fase 5 — Dados Externos
- **T-R5.1** Snapshots mês-a-mês com comparação — `ExternalDataHistory` com `historico: Record<YYYY-MM, ...>` implementado em `ExternalDataPass.ts`

---

## R10 — UX Manager: Tasks restantes ✓ (2026-03-31)

- **T-R10.9** Batch reingest na UI — `SettingsView.tsx` já implementava preview → lista arquivos processados → "Reingerir todos" com confirmação → chama `resetData()` + `batchReingest()`; marcado como concluído

## R3 — Métricas Externas: Segurança e Qualidade ✓ (2026-03-31)

- **T-R3.1** padraoHorario N/A — campo nunca existiu no código; risco mitigado por omissão
- **T-R3.2** Trend indicators nos relatórios — `formatTrend()` adicionado em Weekly/Monthly/SprintReportGenerator; compara commits e PRs merged vs período anterior
- **T-R3.3** Thresholds por nivel — `NIVEL_THRESHOLD_OVERRIDES` em CrossAnalyzer; `analyze()` aceita `nivel`; ExternalDataPass passa `person.nivel`
- **T-R3.4** Insights positivos — tipo `'destaque'` adicionado; `analyzeHighlights()` detecta ciclo rápido, reviews ativas, velocity consistente; cor verde na ExternalDataCard
- **T-R3.5** Caveats em contagens brutas — UI já tinha disclaimer; caveat adicionado em `agenda.prompt.ts`; `cycle.prompt.ts` já tinha instrução explícita

## Revisão Extensiva — Fix de Loops Quebrados ✓ (2026-03-31)

> 6 pontos onde informação era coletada e perdida no pipeline. Todos corrigidos.

- **T-R1.1** PDI update persistido no config.yaml — `pdi_update` do deep pass agora atualiza status de objetivos e adiciona novos; progresso appendado como insight PDI no perfil
- **T-R1.2** Insights sem truncamento na pauta — `.slice(-5)` removido; todos os insights passados ao prompt de geração de pauta
- **T-R1.3** External data no 1:1 deep pass — métricas Jira/GitHub lidas do perfil e passadas como contexto ao build1on1DeepPrompt
- **T-R1.4** Tendência emocional na UI — `tendencia_emocional` e `nota_tendencia` adicionados à interface PerfilFrontmatter; exibidos no card de Saúde (PersonView) e badges no Dashboard (deteriorando/melhorando)
- **T-R1.5** Demandas do gestor no cockpit — novo IPC `demandas:list-by-person`; card "Minhas promessas" no sidebar mostra ações abertas do gestor vinculadas à pessoa
- **T-R1.6** Resumo executivo RH acessível — novo IPC `people:last-resumo-rh`; seção colapsável no tab Perfil com último resumo QR disponível

## Fase 4 — Bugs críticos de ingestão ✓ (2026-03-21)

- **T6.1** SchemaValidator rejeita `null` como campo ausente — reuniões coletivas falhavam sempre com "campo ausente: pessoa_principal"; corrigido com `NULLABLE_FIELDS`; adicionado `sentimento_detectado` e `nivel_engajamento` aos campos obrigatórios
- **T6.2** ArtifactWriter `replaceBlock` com chave inválida — `'resumo_evolutivo'` não existe em `SECTION`, causava TypeError em toda ingestão 2+; corrigido para `'resumo'`
- **T6.3** ArtifactWriter `appendToBlock` inseria no bloco errado — close marker compartilhado entre todos os blocos fazia `String.replace()` sempre inserir no primeiro (`resumo`); corrigido com open+close anchoring; `conquistas` ganhou open marker único; `ProfileMigration` v3 migra perfis existentes
- **T6.4** ClaudeRunner backoff linear → exponencial com jitter (cap 30s); log de retry por tentativa
- **T6.5** IngestionPipeline `shouldRunPass2` — heurística que evita Pass 2 para artefatos curtos (≤300 chars) ou perfis com menos de 2 artefatos

## Fase 1 — Bloqueadores ✓

- **T5.1** Schema migration (`ProfileMigration.ts`) — v1→v2 remove `acoes_pendentes_count` do frontmatter
- **T2.3** Remove `acoes_pendentes_count` do frontmatter — calculado via `ActionRegistry` em runtime
- **T1.1** Corrigir `perfilMdRaw: null` — two-pass approach no `IngestionPipeline`

## Fase 3 — Valor incremental ✓

- **T4.1** Alerta frequência 1:1 — `getTeamRollup` calcula `precisa_1on1_frequencia` e `dias_sem_1on1`; `TeamRiskPanel` exibe na UI
- **T3.2** Resolução de pontos de atenção — campo `pontos_resolvidos` no schema; `markResolvedPoints` no `ArtifactWriter` marca com ~~strikethrough~~
- **T3.3** `ultimo_1on1` por contexto — atualiza quando `necessita_1on1 === false` (cobre 1:1s informais em reuniões)
- **T2.4** Ações coletivas com dono — `syncItemToCollective` cria entradas no `ActionRegistry` da pessoa responsável
- **T4.3** Alertas de ações vencidas — `getTeamRollup` calcula `acoes_vencidas_count`; `TeamRiskPanel` exibe
- **T4.4** Visão agregada do time — `TeamRiskPanel` acima das cards: mostra quem precisa de atenção com motivos
- **T5.2** Pipeline paralelo — `drainQueue` processa até 3 itens em paralelo; `acquirePersonLock` serializa escritas por pessoa

## Fase 2 — Estabilização ✓

- **T1.2** Validação de schema na saída do Claude — `SchemaValidator.ts` com campos obrigatórios e type checks
- **T1.3** Novos campos no schema — `sentimento_detectado`, `nivel_engajamento`, `acoes_comprometidas` como objeto estruturado
- **T2.1** Modelo `Action` atualizado — `prazo`, `owner`, `prioridade`, `responsavel_slug`, `concluidoEm`
- **T2.2** `ActionRegistry` com dados estruturados — extrai prazo e responsável das ações do Claude
- **T3.1** Não sobrescrever `resumo_evolutivo` — resolvido pelo T1.1 (Claude já recebe perfil no pass 2)
- **T4.2** Decay de alertas stale — `ultima_ingestao` no frontmatter + `dados_stale` no rollup e IPC
