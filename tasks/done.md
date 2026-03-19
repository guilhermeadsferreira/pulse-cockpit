# Done — Pulse Cockpit

> Última atualização: 2026-03-19

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
