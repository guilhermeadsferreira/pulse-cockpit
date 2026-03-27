# Roadmap: Pulse Cockpit V2.1

**Milestone:** V2.1 — Completar camada UI e prompts da V2
**Created:** 2026-03-26
**Granularity:** Coarse
**Coverage:** 6/6 requirements mapped

---

## Phases

- [ ] **Phase 1: PersonView Intelligence** — Exibir dados V2 (insights de 1:1, sinais de terceiros, botão QR) no perfil de cada liderado
- [ ] **Phase 2: Settings Reingest UX** — Reingestão em batch com modal de confirmação, progress bar e backup antes de deletar
- [ ] **Phase 3: Enriched Prompts** — Pauta roll-up com gestor consumindo tendências/correlações/riscos compostos; autoavaliação consumindo campos V2

---

## Phase Details

### Phase 1: PersonView Intelligence

**Goal:** O gestor consegue ver, na tela de perfil de cada liderado, os insights extraídos do Pass de 1:1 e os sinais captados em cerimônias — e consegue copiar o resumo executivo de um 1:1 para o clipboard com um clique.
**Depends on:** Nothing (dados já existem em `perfil.md` v5; é pura exibição)
**Requirements:** UI-01, UI-02, UI-03

#### Plans

1. **Insights de 1:1 + Sinais de Terceiros** — Adicionar seções "Insights de 1:1" e "Sinais de Terceiros" em `PersonView.tsx`, lendo dados do `perfil.md` via IPC `person:getPerfil` e renderizando em ordem cronológica reversa. Incluir estado vazio quando os campos ainda não existirem (perfis sem Pass 2 rodado).
2. **Copiar QR** — Adicionar botão "Copiar para QR" nos artefatos de 1:1 em `PersonView.tsx`. O botão copia o campo `resumo_executivo_qr` do artefato para o clipboard via `navigator.clipboard.writeText()`. Renderizar apenas quando o campo existir no artefato.

**Verification:**
- Abrir o perfil de um liderado com 1:1 ingerido após V2 → seção "Insights de 1:1" exibe entradas em ordem decrescente
- Abrir o perfil de um liderado com reunião coletiva ingerida após V2 → seção "Sinais de Terceiros" exibe sinais e correlações
- Perfis sem dados V2 exibem estado vazio legível, sem crash
- Clicar "Copiar para QR" em um artefato de 1:1 → texto do resumo executivo vai para o clipboard; botão não aparece em artefatos sem esse campo

**UI hint**: yes

### Phase 2: Settings Reingest UX

**Goal:** O gestor consegue disparar reingestão em batch na tela de Settings com uma UX segura: modal de confirmação explícita, progress bar em tempo real, e garantia de que nenhum dado é deletado sem backup.
**Depends on:** Nothing (IPC handlers `list-processados`, `reset-data`, `batch-reingest` já existem; concern C1 e C3 precisam ser endereçados aqui)
**Requirements:** SET-01

#### Plans

1. **Backup + Reingest flow** — Antes de chamar `reset-data`, acionar IPC de backup que copia `pessoas/` para `~/.pulsecockpit/backups/YYYY-MM-DD-HH-mm/` (resolve concern C1). Expor os eventos `ingestion:batch-progress` e `ingestion:batch-completed` no `preload/index.ts` e no `global.d.ts` (resolve concern C3 parcialmente — o suficiente para o progress bar funcionar). Adicionar modal de confirmação com texto descritivo do risco + path do backup + botão destrutivo explícito.
2. **Progress bar em `SettingsView`** — Conectar `SettingsView.tsx` aos eventos de progresso expostos no plano anterior. Exibir barra de progresso com contador (N/Total), nome do artefato sendo processado, e estado final (concluído / erro). Desabilitar navegação durante o processo para evitar interrupção acidental.

**Verification:**
- Clicar "Reingerir Tudo" → modal abre com aviso de risco e caminho do backup
- Confirmar no modal → backup de `pessoas/` é criado antes de qualquer deleção
- Durante a reingestão → progress bar avança em tempo real com contagem de artefatos
- Ao concluir → exibir resumo (N artefatos processados, M erros se houver)
- Se fechar o app durante a reingestão → backup persiste em disco

**UI hint**: yes

### Phase 3: Enriched Prompts

**Goal:** A pauta com o gestor (roll-up do time) exibe tendências emocionais, correlações entre liderados e riscos compostos; e o prompt de autoavaliação do gestor consome os campos V2 (feedback_dado, tendência emocional, accountability de ações).
**Depends on:** Nothing (leitura de dados já existentes no `perfil.md`; mudanças cirúrgicas nos arquivos de prompt)
**Requirements:** PMPT-01, PMPT-02

#### Plans

1. **Roll-up enriquecido (PMPT-01)** — Atualizar o handler `index.ts:233` (TODO Fase 5) e o prompt de agenda do gestor para incluir: array de `tendencia_emocional` por liderado, sinais compartilhados entre múltiplos liderados (correlações), e pessoas com múltiplos flags de risco simultâneos (riscos compostos). Atualizar `AgendaGestorAIResult` com os novos campos tipados.
2. **Autoavaliação V2 (PMPT-02)** — Atualizar `src/main/prompts/autoavaliacao.prompt.ts` para consumir: `insights_1on1.feedback_dado` (o que o gestor prometeu de feedback e entregou), `tendencia_emocional` de cada liderado no ciclo, e `acoes_gestor` com `ciclos_sem_mencao` elevado (accountability). Enriquecer a seção de evidências gerada com esses dados.

**Verification:**
- Gerar pauta com o gestor → seção de tendências emocionais do time aparece com dados de pelo menos um liderado
- Gerar pauta com o gestor → se dois ou mais liderados têm sinais correlacionados, a pauta os menciona explicitamente
- Gerar pauta com o gestor → pessoas com múltiplos riscos aparecem destacadas como "risco composto"
- Gerar autoavaliação → documento inclui seção de feedback dado a liderados com base em `feedback_dado`
- Gerar autoavaliação → documento inclui análise de accountability do gestor (ações com `ciclos_sem_mencao > 1`)

---

## Success Criteria

V2.1 está completo quando:

1. A tela de perfil de qualquer liderado com histórico V2 exibe "Insights de 1:1" e "Sinais de Terceiros" sem erros
2. O botão "Copiar para QR" está disponível em artefatos de 1:1 que têm o campo `resumo_executivo_qr`
3. A reingestão em batch na SettingsView executa com modal, backup obrigatório e progress bar funcional
4. A pauta roll-up com o gestor inclui tendências, correlações e riscos compostos do time
5. A autoavaliação do gestor inclui evidências de feedback dado e accountability de ações comprometidas

---

## Requirement Coverage

| Requirement | Phase | Plans |
|-------------|-------|-------|
| UI-01 | Phase 1 | Plan 1 (Insights de 1:1 + Sinais de Terceiros) |
| UI-02 | Phase 1 | Plan 1 (Insights de 1:1 + Sinais de Terceiros) |
| UI-03 | Phase 1 | Plan 2 (Copiar QR) |
| SET-01 | Phase 2 | Plan 1 (Backup + Reingest flow) + Plan 2 (Progress bar) |
| PMPT-01 | Phase 3 | Plan 1 (Roll-up enriquecido) |
| PMPT-02 | Phase 3 | Plan 2 (Autoavaliação V2) |

**Total:** 6/6 requirements mapped. No orphans.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. PersonView Intelligence | 0/2 | Not started | - |
| 2. Settings Reingest UX | 0/2 | Not started | - |
| 3. Enriched Prompts | 0/2 | Not started | - |

---

## Safety Notes

These constraints apply to every plan in this roadmap:

- **No schema changes.** `perfil.md` v5 is the current schema. All plans read existing fields only — no new fields, no migrations.
- **No backend changes.** IPC handlers for ingestion already exist. Phase 1 and 3 are renderer-only changes. Phase 2 adds preload exposure of existing events (not new handlers).
- **Backup before delete.** Phase 2 must create a timestamped backup of `pessoas/` before any `reset-data` call. This is non-negotiable (concern C1 from CONCERNS.md).
- **Surgical edits only.** Zero test coverage means every change must be minimal in surface area. No refactors bundled with feature work.
- **Concerns addressed as side-effects:** Phase 2 partially resolves C1 (backup) and C3 (preload event exposure for batch progress). These are not optional — they are required for SET-01 to be safe and functional.

---

*Last updated: 2026-03-27*

---

## Backlog

### Phase 999.1: Resumo de 1:1 no estilo Qulture Rocks (BACKLOG)

**Goal:** Após a ingestão de um 1:1, gerar um resumo estruturado no estilo Qulture Rocks — com o que foi discutido, compromissos assumidos (por responsável) e próximos passos — e exibi-lo no card do artefato na PersonView com botão de cópia.
**Requirements:** QR-01
**Plans:** 1/1 plans complete

Plans:
- [ ] 999.1-PLAN.md — Refinamento do prompt resumo_executivo_rh + bloco QR no ArtifactCard

### Phase 999.2: Módulo Mentor AI (BACKLOG)

**Goal:** IA de apoio ao gestor para tirar dúvidas sobre gestão, com contexto do projeto e dos liderados. Aproveitar prompt já existente (localização a confirmar).
**Requirements:** TBD
**Plans:** 0 plans
**Note:** Prompt base já existe — recuperar e referenciar antes de planejar.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.3: Performance de Ingestão + Modelo Híbrido (BACKLOG)

**Goal:** Reduzir a latência do pipeline de ingestão via modelo híbrido por estágios: Estágio 1 = Pass Cerimônia via OpenRouter (modelo leve); Estágio 2 (futuro) = Pass 1 se Estágio 1 confirmar viabilidade.
**Requirements:** PERF-01
**Plans:** 3/3 plans complete

Plans:
- [x] 999.3-01-PLAN.md — Fundação híbrida: AppSettings com openRouterApiKey/useHybridModel + runOpenRouterPrompt no ClaudeRunner
- [x] 999.3-02-PLAN.md — Rota condicional no Pass Cerimônia (IngestionPipeline) com fallback para Claude CLI
- [x] 999.3-03-PLAN.md — UI: campo de API key + toggle na SettingsView

### Phase 999.4: OpenRouter Estágio 2 — Pass 1 com modelo leve (BACKLOG)

**Goal:** Migrar o Pass 1 (identificação de pessoa_principal e metadados básicos) para OpenRouter quando o modelo híbrido estiver ativo. Pass mais simples do pipeline — sem contexto de perfil, output estruturado básico — e com maior multiplicador de latência por rodar em todo artefato. Padrão já estabelecido no Pass Cerimônia (roteamento condicional + fallback para Claude CLI).
**Requirements:** PERF-01
**Plans:** 1/1 plans complete

Plans:
- [x] 999.4-01-PLAN.md — Rota híbrida no Pass 1: runOpenRouterPrompt com system prompt + roteamento condicional em processItem
