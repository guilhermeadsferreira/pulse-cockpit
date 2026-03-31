# Backlog — Pulse Cockpit

> Gerado a partir da auditoria técnica em 2026-03-19.
> Última atualização: 2026-03-31 (revisão extensiva — loops, prompts, métricas, UX)

---

## E1 — Engine de Extração

### T1.1 — Corrigir bug `perfilMdRaw: null`
**Arquivo:** `src/main/ingestion/IngestionPipeline.ts:183`

No `processItem`, após identificar `pessoa_principal` cadastrada, carregar o perfil existente via `registry.getPerfil(knownSlug)` e passar `perfilMdRaw: perfil?.raw ?? null` para `buildIngestionPrompt`.

**Por que:** O "resumo evolutivo" sempre sintetiza só o artefato atual — nunca o histórico. Após 5-10 ingestões o gestor percebe e perde confiança no sistema.

**Critério de aceite:**
- [ ] Após 2 ingestões do mesmo liderado, `resumo_evolutivo` integra contexto da primeira ingestão
- [ ] `perfilMdRaw: null` não aparece mais no código de produção

---

### T1.2 — Validação de schema na saída do Claude
**Arquivo:** `src/main/ingestion/IngestionPipeline.ts`

Adicionar validação Zod (ou validação manual) no JSON retornado pelo Claude. Se inválido, logar erro com campo faltante identificado. Item vai para `error` com mensagem legível, não silêncio.

**Por que:** JSON malformado vai silenciosamente para `error` sem diagnóstico. Impossível debugar falhas de extração.

**Critério de aceite:**
- [ ] JSON inválido gera log com campo problemático identificado
- [ ] Item em `error` por schema inválido tem mensagem descritiva no log

---

### T1.3 — Adicionar campos ao schema de extração
**Arquivos:** `src/main/prompts/ingestion.prompt.ts`, tipos compartilhados

Adicionar ao prompt e ao tipo `IngestionAIResult`:
- `sentimento_detectado: 'positivo' | 'neutro' | 'ansioso' | 'frustrado' | 'desengajado'`
- `nivel_engajamento: 1 | 2 | 3 | 4 | 5`
- `acoes_comprometidas` como objeto estruturado: `{ responsavel: string, descricao: string, prazo_iso: string | null }`

**Por que:** `indicador_saude` é proxy fraco para sentimento. Ações com prazo em texto livre bloqueiam alertas de vencimento.

**Critério de aceite:**
- [ ] Perfil gerado contém `sentimento_detectado` e `nivel_engajamento`
- [ ] Ações têm `prazo_iso` como campo separado (não embutido em texto)
- [ ] Schema antiga (text livre em `acoes_comprometidas`) não quebra ingestões existentes

---

## E2 — Action System

### T2.1 — Atualizar modelo `Action` no `ActionRegistry`
**Arquivo:** `src/main/registry/` (ActionRegistry)

Adicionar campos ao tipo `Action`:
```ts
prazo: string | null          // YYYY-MM-DD
owner: 'gestor' | 'liderado' | 'terceiro'
prioridade: 'baixa' | 'media' | 'alta'
responsavel_slug: string | null
concluidoEm: string | null
```

**Depende de:** T5.1 (schema migration)

**Por que:** 12 ações sem deadline ou prioridade → gestor para de usar em 2 semanas.

**Critério de aceite:**
- [ ] `ActionRegistry` persiste e lê os novos campos
- [ ] `actions.yaml` existentes são migrados sem perda de dados
- [ ] Campos são opcionais/nullable para compatibilidade com ações antigas

---

### T2.2 — Alimentar `ActionRegistry` com dados estruturados
**Arquivo:** `src/main/registry/` (ActionRegistry), `src/main/ingestion/IngestionPipeline.ts`

Em `createFromArtifact`, usar `acoes_comprometidas` (objeto de T1.3) para popular `prazo`, `responsavel_slug`, e inferir `owner`.

**Depende de:** T1.3, T2.1

**Por que:** Sem isso, prazo estruturado do schema não chega ao registro — dados são descartados.

**Critério de aceite:**
- [ ] Ação criada de artefato com `prazo_iso` tem `prazo` preenchido no `actions.yaml`
- [ ] `responsavel_slug` preenchido quando responsável é pessoa cadastrada

---

### T2.3 — Remover `acoes_pendentes_count` do frontmatter
**Arquivos:** `src/main/ingestion/ArtifactWriter.ts`, UI que exibe o campo

Remover campo do frontmatter. Onde exibido na UI, calcular diretamente do `ActionRegistry`:
```ts
getActions(slug).filter(a => a.status === 'open').length
```

**Por que:** Duas fontes de verdade divergentes (`count: 8` no perfil vs `3` no registry) destroem confiança no sistema.

**Critério de aceite:**
- [ ] Nenhum código lê ou escreve `acoes_pendentes_count`
- [ ] UI exibe contagem calculada do `ActionRegistry`
- [ ] Perfis existentes com o campo não quebram ao ser lidos

---

### T2.4 — Ações de artefatos coletivos com dono
**Arquivo:** `src/main/ingestion/IngestionPipeline.ts`

Para artefatos `_coletivo`, iterar `acoes_comprometidas` e criar entrada no `ActionRegistry` da pessoa responsável identificada por `responsavel_slug`.

**Depende de:** T2.1, T2.2

**Por que:** Decisões de planning, retro e post-mortem ficam sem dono no sistema — ações órfãs.

**Critério de aceite:**
- [ ] Ação de reunião coletiva com `responsavel: "Ana"` aparece no `ActionRegistry` de `ana-silva`
- [ ] Ações sem responsável identificado vão para `_coletivo` como antes

---

## E3 — Perfil Vivo

### T3.1 — Não sobrescrever `resumo_evolutivo` na íntegra
**Arquivo:** `src/main/ingestion/ArtifactWriter.ts:215`

Em vez de `replaceBlock('resumo_evolutivo', ...)`, fazer merge: o novo resumo gerado pelo Claude (que já recebe o perfil anterior via T1.1) deve integrar contexto anterior, não substituí-lo.

**Depende de:** T1.1

**Por que:** Hoje o bloco é sobrescrito a cada ingestão — "perfil vivo" é marketing, não realidade.

**Critério de aceite:**
- [ ] Após 3 ingestões, `resumo_evolutivo` referencia eventos das 3 sessões
- [ ] Não há perda de histórico entre ingestões

---

### T3.2 — Mecanismo de resolução de pontos de atenção
**Arquivos:** `src/main/prompts/ingestion.prompt.ts`, `src/main/ingestion/ArtifactWriter.ts`

No prompt de ingestão, instruir Claude a identificar `pontos_resolvidos: string[]`. No `ArtifactWriter`, marcar pontos como `~~resolvido~~` e mover para seção `### Pontos Resolvidos`.

**Depende de:** T1.1

**Por que:** Ponto de atenção de 8 meses atrás tem mesmo peso que o de ontem — perfil vira ruído.

**Critério de aceite:**
- [ ] Ingestão que resolve ponto anterior marca-o como resolvido no perfil
- [ ] Pontos resolvidos ficam visíveis mas distinguíveis dos ativos

---

### T3.3 — `ultimo_1on1` atualizar por contexto
**Arquivo:** `src/main/ingestion/ArtifactWriter.ts`

Se artefato de reunião tem `necessita_1on1: false` extraído pelo Claude (indicando que 1:1 informal ocorreu), atualizar `ultimo_1on1` no frontmatter.

**Depende de:** T1.1

**Por que:** Gestores com 1:1s informais têm alertas de frequência permanentemente incorretos.

**Critério de aceite:**
- [ ] Reunião com `necessita_1on1: false` atualiza `ultimo_1on1` no frontmatter
- [ ] Reunião de tipo `1on1` continua atualizando normalmente

---

## E4 — Alertas & Insights

### T4.1 — Alerta de frequência de 1:1 (aritmética pura)
**Arquivo:** onde alertas são gerados / `getTeamRollup`

```ts
const diasSemOneon1 = differenceInDays(today, lastOneOnOne)
const precisaOneon1 = diasSemOneon1 > (pessoa.frequencia_1on1_dias + 3)
```

**Por que:** `frequencia_1on1_dias` existe no `PersonConfig` mas nunca é comparado com `ultimo_1on1`. Feature crítica sem IA.

**Critério de aceite:**
- [ ] Pessoa sem 1:1 há `frequencia_1on1_dias + 3` dias aparece com alerta na UI
- [ ] Alerta some após nova ingestão que atualiza `ultimo_1on1`

---

### T4.2 — Decay de alertas stale
**Arquivo:** `src/main/ingestion/ArtifactWriter.ts`, lógica de exibição de alertas

Adicionar `ultima_ingestao: date` ao frontmatter. Se `differenceInDays(today, ultima_ingestao) > 30`, exibir como "sem dados recentes" em vez de propagar `alerta_estagnacao: true`.

**Por que:** Férias de 2 semanas geram alerta de estagnação. Gestor aprende a ignorar todos os alertas.

**Critério de aceite:**
- [ ] Perfil sem ingestão há 30+ dias exibe badge "sem dados" em vez de alertas de saúde ativos
- [ ] `ultima_ingestao` é atualizado a cada ingestão bem-sucedida

---

### T4.3 — Alertas de ações vencidas
**Arquivo:** lógica de `getTeamRollup` ou equivalente

Calcular `acoes_vencidas` filtrando `status === 'open' && prazo < today`. Surfaçar na UI por pessoa.

**Depende de:** T2.1, T2.2

**Por que:** Sem alertas de vencimento, deadlines estruturados não geram valor visível.

**Critério de aceite:**
- [ ] Ação com `prazo` passado e `status: open` aparece como "vencida" na UI
- [ ] Contagem de ações vencidas aparece no painel por pessoa

---

### T4.4 — Visão agregada de saúde do time
**Arquivo:** UI / novo componente de dashboard

Tela ou seção com:
- Média de saúde do time
- Quem está abaixo da média
- Quem tem mais ações vencidas
- Quem não teve 1:1 recente

**Depende de:** T4.1, T4.3

**Por que:** Gestor precisa de "quem precisa de atenção agora?" — perfis individuais não respondem essa pergunta.

**Critério de aceite:**
- [ ] Dashboard exibe ranking de risco do time com pelo menos 3 métricas
- [ ] Clique em pessoa abre perfil individual

---

## E5 — Infra & Robustez

### T5.1 — Schema migration via `schema_version`
**Arquivo:** novo módulo `src/main/migration/`

Implementar `migrateProfile(raw: string): string` que detecta `schema_version` no frontmatter e aplica transforms incrementais. Bumpar `schema_version` após cada mudança de schema.

**Por que:** Qualquer mudança de schema sem migration corrompe todos os perfis existentes silenciosamente. `schema_version: 1` existe no frontmatter mas não há lógica de migração.

**Critério de aceite:**
- [ ] Perfil com `schema_version: 1` é lido e migrado para versão atual sem perda de dados
- [ ] Novo campo adicionado tem valor default aplicado automaticamente em perfis antigos

---

### T5.2 — Pipeline com concorrência limitada
**Arquivo:** `src/main/ingestion/IngestionPipeline.ts` (`drainQueue`)

Substituir loop serial por processamento com até 3 itens em paralelo. Reportar progresso via IPC.

**Por que:** 10 artefatos × 90s = 15 min bloqueados. Onboarding inicial com muitos artefatos é inviável.

**Critério de aceite:**
- [ ] 10 artefatos processam em ~⅓ do tempo atual
- [ ] Progresso parcial reportado para o renderer via IPC durante processamento
- [ ] Sem conflito de escrita em `perfil.md` quando 2 artefatos da mesma pessoa processam em paralelo

---

## R1 — Revisão Extensiva: Loops de Retroalimentação (2026-03-31)

> Identificados na revisão extensiva do pipeline de ingestão → perfil → pauta → ciclo.
> Prioridade: Alta — informação coletada e perdida reduz valor do sistema.

### ~~T-R1.1~~ — Persistir `pdi_update` no config.yaml ✓ (2026-03-31)
Implementado. PDI objectives atualizados automaticamente após 1:1 deep pass.

### ~~T-R1.2~~ — Remover truncamento `.slice(-5)` de insights na pauta ✓ (2026-03-31)
Implementado. Todos os insights agora passados ao prompt de agenda.

### ~~T-R1.3~~ — Passar external data para o 1:1 deep pass ✓ (2026-03-31)
Implementado. Métricas Jira/GitHub incluídas no contexto do prompt 1on1-deep.

### ~~T-R1.4~~ — Expor `tendencia_emocional` na UI ✓ (2026-03-31)
Implementado. Visível no card de Saúde (PersonView) e badges no Dashboard.

### ~~T-R1.5~~ — Linkar demandas do gestor no cockpit da pessoa ✓ (2026-03-31)
Implementado. Card "Minhas promessas" no sidebar da PersonView.

### ~~T-R1.6~~ — Surfacear `resumo_executivo_rh` ✓ (2026-03-31)
Implementado. Seção colapsável no tab de Perfil com último resumo QR disponível.

---

## R2 — Revisão Extensiva: Qualidade dos Prompts (2026-03-31)

> Inconsistências e blind spots identificados nos 9 prompts do sistema.

### T-R2.1 — Criar `PromptConstants.ts` com enums compartilhados
**Arquivos:** novo `src/main/prompts/constants.ts`, todos os prompts

Extrair para módulo compartilhado:
- Calibração de confiança por tipo de artefato (não por tamanho)
- Thresholds de `necessita_1on1` (hoje inconsistente entre ingestion e cerimônia)
- Calibração de tom por `relacao` (repetido em 3 prompts)
- Enum de saúde, sentimento, engajamento

**Por que:** Mesma calibração com thresholds diferentes em 3 prompts gera inconsistência de sinais.

**Critério de aceite:**
- [ ] Prompts importam constantes de `PromptConstants.ts`
- [ ] Threshold de `necessita_1on1` é idêntico entre ingestion e cerimônia
- [ ] Confiança calibrada por tipo de artefato, não por tamanho

---

### T-R2.2 — Sentimento como array contextual
**Arquivo:** `src/main/prompts/ingestion.prompt.ts`, tipos compartilhados

Mudar `sentimento_detectado` de valor único para array:
```ts
sentimentos: Array<{ valor: string; aspecto: string }>
```
Permite: pessoa positiva sobre entrega E frustrada com processo no mesmo artefato.

**Por que:** Averaging para um valor perde o sinal mais importante para a pauta.

**Critério de aceite:**
- [ ] Schema retorna array de sentimentos com contexto
- [ ] ArtifactWriter persiste os sentimentos no perfil
- [ ] Backward-compat: perfis com sentimento único continuam legíveis

---

### T-R2.3 — Frequência em pontos de atenção
**Arquivo:** `src/main/prompts/ingestion.prompt.ts`, `ArtifactWriter.ts`

Adicionar `frequencia: "primeira_vez" | "recorrente"` a cada ponto de atenção.

**Por que:** Após 10+ ingestões, gestor não sabe se ponto é pattern ou one-off.

**Critério de aceite:**
- [ ] Prompt instrui Claude a classificar frequência
- [ ] Perfil exibe badge de recorrência nos pontos de atenção

---

### T-R2.4 — Auto-percepção do liderado no 1:1 deep pass
**Arquivo:** `src/main/prompts/1on1-deep.prompt.ts`

Adicionar campo opcional:
```ts
auto_percepcao?: 'alinhada_com_feedback' | 'cega' | 'inflacionada_positivamente'
```
Captura se liderado tem insight sobre próprias forças/fraquezas.

**Por que:** Self-aware people respondem a coaching diferente de blind spots.

**Critério de aceite:**
- [ ] Campo presente na saída do deep pass quando há evidência
- [ ] Valor appendado como insight no perfil
- [ ] Pauta usa para calibrar abordagem de perguntas

---

### T-R2.5 — `flag_promovibilidade` condicional no ciclo
**Arquivo:** `src/main/prompts/cycle.prompt.ts`

Expandir de `sim|nao|avaliar` para `sim|condicionado_a|nao|avaliar`.
`condicionado_a` exige descrição do que falta ("demonstrar liderança no próximo projeto").

**Por que:** 70% dos casos de calibração reais são condicionais.

**Critério de aceite:**
- [ ] Prompt aceita e instrui `condicionado_a` com evidência
- [ ] UI do relatório de ciclo exibe condição quando aplicável

---

### T-R2.6 — Limite dinâmico de alertas na pauta
**Arquivo:** `src/main/prompts/agenda.prompt.ts`

Cap de 3 alertas priorizados por impacto. Se há mais, os excedentes ficam em seção "Outros alertas".
Reconhecimentos: priorizar últimos 14 dias; se não há, últimos 30; se não há, array vazio.

**Por que:** 10+ alertas = alert fatigue. Reconhecimentos velhos parecem artificiais.

**Critério de aceite:**
- [ ] Máximo 3 alertas na seção principal da pauta
- [ ] Reconhecimentos recentes priorizados (14d → 30d → vazio)

---

## R3 — Revisão Extensiva: Métricas Externas (2026-03-31)

> Problemas de qualidade, segurança e actionability nas métricas Jira/GitHub.

### T-R3.1 — Remover ou disclaimerizar `padraoHorario`
**Arquivo:** `src/main/external/GitHubMetrics.ts`, `ExternalDataCard.tsx`

`padraoHorario` (manha/tarde/noite) classifica commits por horário. Risco de interpretação danosa (burnout, work-life balance). Não distingue CI/CD de trabalho real.

**Opção A:** Remover completamente.
**Opção B:** Renomear para "deployment pattern" + disclaimer: "Não reflete horário de trabalho."

**Por que:** Pode violar direito à desconexão e prejudicar pessoa injustamente.

**Critério de aceite:**
- [ ] `padraoHorario` removido ou renomeado com disclaimer visível
- [ ] Não aparece em relatórios ou cycle reports como métrica de performance

---

### T-R3.2 — Trend indicators (↑↓→) nos relatórios
**Arquivos:** `DailyReportGenerator.ts`, `WeeklyReportGenerator.ts`, `MonthlyReportGenerator.ts`

Adicionar comparação com período anterior:
```
commits: 42 (↓15% vs semana anterior)
PRs merged: 8 (↑33% vs semana anterior)
```

**Por que:** Relatórios são snapshots sem contexto temporal. Gestor precisa de tendência.

**Critério de aceite:**
- [ ] Cada métrica principal mostra variação % vs período anterior
- [ ] Indicador visual (↑↓→) presente

---

### T-R3.3 — Thresholds calibráveis por nível/cargo
**Arquivo:** `src/main/external/CrossAnalyzer.ts`

Hoje thresholds são fixos (sobrecarga_issues: 5). Calibrar por `PersonConfig.nivel`:
- Junior: threshold mais baixo
- Senior/Staff: threshold mais alto (acostumados com paralelismo)

**Por que:** 8 issues para um sênior ≠ 8 issues para um júnior.

**Critério de aceite:**
- [ ] CrossAnalyzer recebe `nivel` da pessoa
- [ ] Thresholds ajustados por faixa de senioridade
- [ ] Settings permite override manual dos thresholds

---

### T-R3.4 — Insights positivos no CrossAnalyzer
**Arquivo:** `src/main/external/CrossAnalyzer.ts`

Adicionar detecção de:
- `destaque`: velocity acima da média, merge time reduzido, code reviews excepcionais
- `crescimento`: aumento consistente de contribuições por 3+ semanas

**Por que:** Só flagging negativo treina gestor a ver apenas problemas. Corrói relação.

**Critério de aceite:**
- [ ] CrossAnalyzer gera insights tipo `destaque` e `crescimento`
- [ ] Insights positivos aparecem nos relatórios e no ExternalDataCard
- [ ] Pauta usa para gerar reconhecimentos contextualizados

---

### T-R3.5 — Caveat em contagens brutas (commits, PRs)
**Arquivos:** `ExternalDataCard.tsx`, relatórios, `cycle.prompt.ts`

Adicionar nota visível: "Contagens não refletem impacto ou qualidade" onde commits/PRs são exibidos.
No prompt de ciclo: instruir Claude a não usar contagens brutas como evidência primária.

**Por que:** `commits30d` e `prsMerged30d` incentivam gaming e não medem impacto.

**Critério de aceite:**
- [ ] Disclaimer visível na UI onde contagens são exibidas
- [ ] Prompt de ciclo instrui: "Use contagens como contexto, nunca como evidência principal"

---

## R4 — Revisão Extensiva: UX do Gestor (2026-03-31)

> Gaps na experiência diária do gestor usando o app.

### T-R4.1 — PDI como cidadão de primeira classe na UI
**Arquivos:** `PersonView.tsx`, `PersonFormView.tsx`, novo componente PDI

- UI para criar/editar/visualizar PDI objectives (hoje é YAML puro)
- Barra de progresso visual por objetivo (nao_iniciado → em_andamento → concluido)
- Link entre ações e objetivos PDI
- Inclusão estruturada no relatório de ciclo

**Depende de:** T-R1.1 (já implementado — PDI atualizado automaticamente)

**Por que:** PDI é central para gestão de pessoas mas vive escondido em YAML.

**Critério de aceite:**
- [ ] PersonFormView tem seção dedicada para PDI com add/edit/remove
- [ ] PersonView exibe PDI com status visual e progresso
- [ ] Ações tipo `pdi` linkadas ao objetivo correspondente
- [ ] Relatório de ciclo tem seção "Aderência ao PDI" com evidências

---

### T-R4.2 — Dados externos em posição proeminente
**Arquivo:** `PersonView.tsx`

Mover `ExternalDataCard` do sidebar (268px) para tab próprio ou seção proeminente no conteúdo principal.

**Por que:** Para gestores que usam Jira+GitHub, dados externos são tão importantes quanto o perfil vivo.

**Critério de aceite:**
- [ ] ExternalDataCard com mais espaço e visibilidade
- [ ] Timeline/trends visíveis (não só snapshot)

---

### T-R4.3 — "O que mudou desde a última 1:1?"
**Arquivo:** `PersonView.tsx`, novo componente

Ao abrir cockpit de uma pessoa, exibir resumo de mudanças desde `ultimo_1on1`:
- Novos artefatos ingeridos
- Mudanças de saúde
- Ações concluídas/vencidas
- Novos insights de cerimônia

**Por que:** Gestor abre cockpit antes da 1:1 e quer saber "o que aconteceu desde a última vez?".

**Critério de aceite:**
- [ ] Seção "Desde a última 1:1" no topo do tab Perfil
- [ ] Lista mudanças com data e tipo

---

### T-R4.4 — Narrativa do resumo evolutivo preservada
**Arquivo:** `src/main/ingestion/ArtifactWriter.ts`, `compression.prompt.ts`

Hoje o resumo é reescrito a cada ingestão e comprimido a cada 10 artefatos. Context longitudinal se perde.

**Opção:** Manter últimos 3 resumos anteriores em seção colapsada, para o prompt ter contexto de evolução narrativa.

**Por que:** Sem histórico de resumos, o perfil reflete apenas os últimos 2-3 artefatos.

**Critério de aceite:**
- [ ] Seção "Resumos Anteriores" preserva últimos 3 resumos com data
- [ ] Prompt de ingestion pass 2 recebe resumos anteriores como contexto
- [ ] Compressão preserva resumos como referência

---

## R5 — Revisão Extensiva: Silos de Dados (2026-03-31)

> Dados armazenados mas nunca usados downstream.

### T-R5.1 — Snapshots externos mês-a-mês com comparação
**Arquivo:** `ExternalDataPass.ts`, `CrossAnalyzer.ts`

`external_data.yaml` já guarda `historico` por mês. Mas cada mês é analisado fresh sem comparar com anterior.

**Melhoria:** CrossAnalyzer deve comparar current vs previous month para detectar tendências de 2+ meses.

**Critério de aceite:**
- [ ] CrossAnalyzer acessa historical snapshots
- [ ] Insights de tendência multi-mês (3+ meses de crescimento, declínio sustentado)

---

### T-R5.2 — Ação bidirectional: sync status com Jira/GitHub
**Arquivos:** `ActionRegistry.ts`, `ExternalDataPass.ts`

Se uma ação tem issue ID no Jira e o issue foi fechado, marcar ação como `done` automaticamente.

**Por que:** Ações ficam `open` eternamente se não mencionadas em 1:1, mesmo quando concluídas no Jira.

**Critério de aceite:**
- [ ] Ações com referência a issue Jira são auto-fechadas quando issue muda para Done
- [ ] Log de auto-fechamento com evidência

---

### T-R5.3 — Team rollup para insights cross-team
**Arquivo:** `PersonRegistry.ts` (getTeamRollup), novo módulo de insights

`LideradoSnapshot` é gerado para gestor agenda mas nunca usado para detectar padrões do time:
- 3+ pessoas com saúde amarelo = problema sistêmico
- Workload alto em todo o time = capacidade insuficiente
- Nenhuma evolução no time todo = problema de desafios/oportunidades

**Critério de aceite:**
- [ ] Insights cross-team gerados a partir dos snapshots
- [ ] Exibidos no Dashboard como "Saúde do Time" ou similar

---

## R6 — Revisão Extensiva: Prompt Refinements Detalhados (2026-03-31)

> 30 ajustes granulares nos prompts identificados na revisão. Agrupados por prompt.

### T-R6.1 — Ingestion: Clarificar `pessoas_identificadas` vs mencionadas
Ambiguidade: pessoa mencionada 5x ("vou falar com o Paulo") não é igual a participante presente.
- [ ] Regra explícita: mencionado ≠ presente ≠ responsável
- [ ] Pessoas mencionadas sem participação → `pontos_de_atencao` ("Necessário alinhamento com X")

### T-R6.2 — Ingestion: `pessoas_esperadas_ausentes` (Attendee Accountability)
Gestor precisa saber quem deveria estar na reunião mas não compareceu.
- [ ] Campo opcional `pessoas_esperadas_ausentes: string[]` para planning/retro/daily

### T-R6.3 — Ingestion: `temas_detectados` vs `temas_atualizados` — clarificar distinção
`temas_detectados` = só deste artefato. `temas_atualizados` = lista cumulativa deduplicated.
- [ ] Documentar distinção no prompt e no tipo TypeScript

### T-R6.4 — Ingestion: Early stagnation detection (primeiros 3 meses)
`alerta_estagnacao` retorna false quando sem histórico. Deveria detectar ausência de desafios novos.
- [ ] Se <2 conquistas e <2 declarações forward-looking, flag como "monitorar"

### T-R6.5 — Ingestion: Profundidade de compreensão
Novo campo `depth_compreensao: "superficial" | "declarativa" | "profunda"` — se pessoa entende o WHY.
- [ ] Campo opcional no schema de ingestion

### T-R6.6 — 1on1-deep: Follow-up patterns parciais
`ciclos_sem_mencao` hoje é contagem bruta. Falta: "ação X não mencionada 5x consecutivas = padrão de evasão".
- [ ] Enriquecer followup com `padrão_risco: boolean` quando ciclos >= 3

### T-R6.7 — 1on1-deep: `correlacoes_nao_abordadas` (sinais em silêncio)
Se sinal de terceiro existe no perfil e liderado não mencionou no 1:1, registrar como "não abordado".
- [ ] Novo campo `correlacoes_nao_abordadas: string[]`

### T-R6.8 — 1on1-deep: PDI drift detection
Detectar quando liderado se afasta de objetivo PDI sem comunicar explicitamente.
- [ ] Campo `pdi_divergencia: string | null` ("objetivo_abandonado_tacitamente")

### T-R6.9 — 1on1-deep: Tendência emocional requer 2+ 1:1s para "deteriorando"
Evitar over-weight de uma única 1:1 ruim.
- [ ] Regra: "deteriorando" exige evidência DESTA 1:1 + última entrada no histórico de saúde

### T-R6.10 — 1on1-deep: Resumo executivo RH sem dados sensíveis
Se 1:1 tocou temas pessoais/saúde, resumo QR deve usar eufemismo.
- [ ] Regra: "Pessoal: alinhado. Continuaremos acompanhando." nunca expor detalhes

### T-R6.11 — Cerimônia: Participação mínima diferenciada por tipo
Retro/planning → silêncio é sinal. Daily → silêncio pode ser normal.
- [ ] Calibrar `nivel_engajamento` e `necessita_1on1` por tipo de cerimônia

### T-R6.12 — Cerimônia: Soft skills para escuta ativa
Permitir captura de "escuta ativa" como soft skill mesmo em low-participation.
- [ ] Regra: "Demonstrou escuta ativa ao validar preocupação" é skill válida

### T-R6.13 — Cerimônia: Feedback com atribuição completa
Formato: `[QUEM fez] → [O QUÊ] → [IMPACTO em QUEM]` — evitar ambiguidade.
- [ ] Exemplos explícitos no prompt

### T-R6.14 — Cerimônia: Saúde calibrada por cargo/nível
Staff Engineer silencioso ≠ Júnior silencioso. Expectations devem usar `pessoaCargo`.
- [ ] Regra condicional por nível no prompt

### T-R6.15 — Agenda: `ciclos_sem_mencao` → dias em aberto
Threshold de 2 ciclos ignora frequência. 2 ciclos semanais = 14d. 2 ciclos mensais = 60d.
- [ ] Mudar para `dias_em_aberto >= 45` ou `prazo + tolerance`

### T-R6.16 — Agenda: Clarificar distinção temas vs follow-ups
Follow-ups = ações concretas pendentes. Temas = áreas recorrentes para discussão.
- [ ] Regra explícita com exemplos no prompt

### T-R6.17 — Cycle: `linha_do_tempo` flexível (5-10 eventos)
Fixo em 10 pode ser muito para ciclos curtos ou pouco para ciclos longos.
- [ ] Mudar para "5-10 eventos, AI decide densidade por significância"

### T-R6.18 — Cycle: Expectativas benchmarked por cargo
"Acima/dentro/abaixo das expectativas" sem definir expectativas de quem/qual nível.
- [ ] Regra: "Expectativas baseadas no nível/cargo (ex: para Senior esperamos...)"

### T-R6.19 — Cycle: Evidências de promovibilidade nunca triviais
Quando flag = "nao", evidências devem listar gaps concretos com comportamento observado.
- [ ] Regra: "Nunca filler — gaps com evidência comportamental"

### T-R6.20 — Compression: Definir "ponto resolvido" explicitamente
~~strikethrough~~ = resolvido? Ou apenas se dito explicitamente?
- [ ] Regra: ~~strikethrough~~ OU contradição por evidência clara de superação

### T-R6.21 — Compression: Conquistas preservam título + outcome
Consolidação de conquistas antigas deve manter: "[evento] (data) — [impacto]"
- [ ] Regra: não comprimir abaixo de "título + data + impacto resumido"

### T-R6.22 — Compression: Temas com vocabulário controlado (max 8)
Deduplicação por string match falha com variações. "comunicação" = "comunicação assertiva"?
- [ ] Regra: merge no parent level, max 8 temas, priorizar por frequência recente

### T-R6.23 — Autoavaliação: Valores calibrados por cargo
Manager foca em "gestão, visão, alinhamento". IC foca em "colaboração, qualidade, iniciativa".
- [ ] Receber `managerRole` e calibrar eixo "valores" por tipo

### T-R6.24 — Autoavaliação: Desafios reconhecidos
Novo campo: `desafios_observados: string[]` — áreas de dificuldade/incerteza.
- [ ] Campo obrigatório se há evidência no período

### T-R6.25 — Gemini: Mode detection por conteúdo, não filename
Arquivo "Sync com Ana" pode ser 1:1 ou standup. Analisar primeiras 500 chars para num_speakers.
- [ ] Se 1-2 speakers → light, else → full. Ou permitir override manual

### T-R6.26 — Gemini: Emotional content em full mode
Retros/plannings contêm sinais emocionais que full mode pode comprimir.
- [ ] Seção opcional: "Tone observations: [frustração, excitação]"

### T-R6.27 — Gemini: Speaker identification confidence
Se atribuição de speaker é ambígua, marcar explicitamente.
- [ ] Metadata: `speaker_confidence: "alta" | "media" | "baixa"`

### T-R6.28 — Gestor-ciclo: Definir decisão como trade-off
"Continuamos como está" não é decisão. Exigir trade-off ou rejeição de alternativa.
- [ ] Regra: decisão requer trade-off ou direção contrária a alternativa

### T-R6.29 — Gestor-ciclo: Aprendizado obrigatório (min 1)
Array vazio para aprendizados é aceitável demais. Sempre há algo sobre dinâmica/pessoas/risco.
- [ ] Mínimo 1 aprendizado obrigatório

### T-R6.30 — `origem_pauta` simplificar para 3 opções claras
Regra atual é confusa para feedback de terceiros. Simplificar:
- liderado: pessoa controlou outcome
- gestor: gestor introduziu tema
- terceiro: pessoa/time externo bloqueou/impactou (nome obrigatório)

---

## R7 — Revisão Extensiva: Feedback Loops & Data Pipeline (2026-03-31)

> Gaps no fluxo de dados entre camadas que não foram cobertos por R1.

### T-R7.1 — External data timing: pré-buscar antes do deep pass
ExternalDataPass roda fire-and-forget APÓS sync. Deep pass não tem dados frescos.
- [ ] Se external_data.yaml existe E cache não expirou, dados já estão lá (fix parcial T-R1.3)
- [ ] Se não existe, disparar fetch ANTES do deep pass (não fire-and-forget)

### T-R7.2 — Demandas alimentarem pauta e 1:1 planning
Demandas do gestor com `pessoaSlug` deveriam aparecer como contexto no prompt de pauta.
- [ ] buildAgendaPrompt recebe `demandasGestor: string` como seção adicional

### T-R7.3 — Temas: deduplicação fuzzy (não por string match exato)
"comunicação assertiva" e "comunicação" devem ser merged. Variações leves criam duplicatas.
- [ ] Lógica de merge por substring ou keyword overlap antes de persistir

### T-R7.4 — Health history: cleanup automático (manter últimos 50)
Histórico de saúde cresce unbounded. Após 100+ ingestões, perfil fica muito grande.
- [ ] Manter últimas 50 entradas, comprimir anteriores em resumo

### T-R7.5 — Frontmatter health transitions: log de mudanças
Hoje só `saude: "verde"` é persistido. Não há trilha de auditoria de mudanças.
- [ ] Append `saude_anterior` no histórico quando muda (já parcial via "Histórico de Saúde")

---

## R8 — Revisão Extensiva: Métricas Externas Avançadas (2026-03-31)

> Dimensões de métricas ausentes para gestão de pessoas.

### T-R8.1 — Code review depth (comments/PR, turnaround)
`prsRevisados` conta rubber-stamp igual a review profundo. Adicionar:
- [ ] Comments por review (média)
- [ ] Turnaround de primeira review
- [ ] Approval rate vs changes-requested rate

### T-R8.2 — Collaboration score (co-authors, cross-team mentions)
Detectar mentoring e ajuda a outros via:
- [ ] Co-authored commits
- [ ] PRs reviewed em outros repos
- [ ] Mentions em issues de outros

### T-R8.3 — Test coverage trend per PR
% de PRs com mudanças de teste. Proxy para qualidade.
- [ ] Parse PR diffs para presença de arquivos de teste
- [ ] Trend: "X% dos PRs incluem testes"

### T-R8.4 — CrossAnalyzer: Root cause context
Insights dizem "PRs acumulando" mas não dizem: awaiting review? awaiting changes? stale?
- [ ] Breakdown de PR state no insight (awaiting review vs changes requested vs approved-not-merged)

### T-R8.5 — CrossAnalyzer: Desalinhamento com contexto
Activity drop pode ser: férias, licença, mentoring, burnout. Hoje tudo é "desalinhamento".
- [ ] Checar contra `notas_manuais` (férias mencionadas?) antes de flaggar

### T-R8.6 — Relatórios: Narrative context from perfil
Relatórios mostram números sem explicar WHY. Injetar contexto do perfil:
- [ ] "Jane: commits dropped 40% — nota: estava em licença até dia 15"

### T-R8.7 — Relatórios: Baseline comparison pessoal
"8 issues abertas" não diz nada sem baseline. Comparar com média da própria pessoa.
- [ ] "8 issues (média 3m: 5 — acima do normal)"

---

## R9 — Revisão Extensiva: Action System Avançado (2026-03-31)

> Gaps no ciclo de vida das ações e rastreabilidade.

### T-R9.1 — Ação → Artefato fonte: link bidirecional
Hoje `fonteArtefato` existe mas não é exibido. Gestor não consegue "ver a discussão original".
- [ ] UI exibe link para artefato fonte na lista de ações

### T-R9.2 — Escalation: dependência gestor → liderado
Se ação do liderado depende de ação do gestor, nenhum alerta cruza. Gestor esquece.
- [ ] Detectar dependência quando acoes_gestor e acoes_liderado referenciam mesmo tema
- [ ] Alerta: "Sua promessa X bloqueia ação Y de [pessoa]"

### T-R9.3 — Histórico de status das ações (audit trail)
Ação muda de open → done mas não há registro de QUANDO e POR QUE mudou.
- [ ] Array `statusHistory: { status, date, source }[]` no action

### T-R9.4 — Prioridade atualizada pelo deep pass
Campo `prioridade` existe mas nunca é atualizado pela IA. Deveria inferir urgência.
- [ ] Deep pass atualiza prioridade se contexto indica mudança

### T-R9.5 — Evidence aggregation para PDI
Múltiplos artefatos podem ter evidência para o mesmo objetivo PDI. Não são agregados.
- [ ] Novo campo em PDI: `evidencias: string[]` acumulado por ingestão

---

## R10 — Revisão Extensiva: UX Gaps Restantes (2026-03-31)

> Lacunas na experiência do gestor não cobertas por R4.

### T-R10.1 — Dashboard: urgências do dia (TodayView parcial)
Risk panel existe mas não responde "O QUE fazer AGORA?".
- [ ] Seção no topo: 1:1s da semana, ações vencendo hoje, alertas novos

### T-R10.2 — Risk panel para pares e gestores
Hoje hard-coded para `relacao === 'liderado'`. Pares e gestores não têm risk panel.
- [ ] Estender risk calculation para todas as relações

### T-R10.3 — Stale data aggregado no dashboard
`dados_stale` é per-person. Falta: "5 pessoas sem dados em 30+ dias".
- [ ] Alert bar no topo: "N pessoas com dados desatualizados"

### T-R10.4 — External data: parsing robusto (não regex)
ExternalDataCard faz regex-based YAML parsing. Frágil se formato muda.
- [ ] Retornar JSON tipado do IPC, parsear com js-yaml no backend

### T-R10.5 — Agenda generation agendada (pré-1:1)
Gestor precisa lembrar de clicar "Gerar pauta". Deveria ser automático baseado na frequência.
- [ ] Scheduler gera pauta N dias antes do próximo 1:1 esperado

### T-R10.6 — Cycle report com defaults de período inteligentes
Requer input manual de `periodoInicio` e `periodoFim`. Deveria sugerir:
- [ ] Default: últimos 90 dias, ou último trimestre, ou último ciclo de avaliação

### T-R10.7 — Campo `contexto` das ações visível na UI
Ações tab não exibe `contexto` (V2 field). Informação existe mas escondida.
- [ ] Exibir contexto como texto secundário abaixo da descrição

### T-R10.8 — Sprint refresh IPC sem UI trigger
`external:refreshSprint` definido no preload mas sem botão na UI.
- [ ] Adicionar botão "Gerar Sprint" na RelatoriosView

### T-R10.9 — Batch reingest exposto na UI
IPC `ingestion:batchReingest` existe mas sem superfície. Útil para re-processar com prompts novos.
- [ ] Botão em Settings: "Reprocessar todos os artefatos" com confirmação

---
