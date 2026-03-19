# Backlog — Pulse Cockpit

> Gerado a partir da auditoria técnica em 2026-03-19.
> Última atualização: 2026-03-19

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
