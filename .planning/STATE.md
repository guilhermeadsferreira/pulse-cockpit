---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Phase 04 Complete
last_updated: "2026-04-01T13:00:00Z"
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 11
  completed_plans: 11
---

# Project State — Pulse Cockpit V2.1

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-26)

**Core value:** O contexto acumulado ao longo do ciclo deve estar acessível para o gestor na hora que importa: na tela do perfil, na pauta e no relatório de calibração.
**Current focus:** Phase 03 — github-metrics-crossanalyzer

## Current Status

**Milestone:** V2.1 — Completar camada UI e prompts da V2
**Active phase:** Phase 04 — action-system-ux-avancado (complete)
**Last action:** Phase 04 complete — all 5 plans verified (2026-04-01)

## Decisions

- [Phase 04-01]: statusHistory como campo opcional para backward-compat com acoes existentes
- [Phase 04-01]: appendHistory centralizado inicializa array se ausente — zero risco para dados existentes
- [Phase 04-01]: Jira sync usa searchIssuesByEmail com JQL customizado por issue key (plan referenciava metodo inexistente)
- Extração do resumo QR via regex sobre content já carregado no ArtifactCard (sem novo IPC)
- Bloco QR renderizado como `<pre>` (não MarkdownPreview) para fidelidade ao texto copiado
- [Phase 999.3]: ts() helper adicionado inline no ClaudeRunner como função privada (não existia no arquivo original)
- [Phase 999.3]: hybridActive calculado antes do loop de batch no Pass Cerimônia (não por iteração) — openRouterModel hardcoded como google/gemma-3-4b-it:free nesta fase
- [Phase 999.3]: global.d.ts não alterado — AppSettings importado de ipc.ts que já tem os campos novos (plan 01)
- [Phase 999.3]: Toggle desabilitado quando openRouterApiKey ausente — evita estado inválido (useHybridModel=true sem key)
- [Phase 999.4]: systemPrompt adicionado como 5º parâmetro opcional ao runOpenRouterPrompt — callers existentes (Pass Cerimônia) continuam válidos sem modificação
- [Phase 999.4]: validateIngestionResult atua como gate de qualidade pós-OpenRouter — schema inválido aciona fallback para Claude CLI em vez de lançar exceção
- [Phase 999.4]: Timeout de 60_000ms para Pass 1 via OpenRouter (vs 90_000ms via Claude CLI) — modelos leves são mais rápidos
- [Phase 999.5]: Google AI API direta (não via OpenRouter) para Gemini Flash — mais controle e preço previsível
- [Phase 999.5]: Temperatura 0.1 no Gemini para respostas determinísticas na limpeza de transcrições
- [Phase 999.5]: Fallback silencioso — se pré-processamento falha, usa texto original (nunca perde dados)
- [Phase 01]: PRMT-10 implementado via substituicao cirurgica da regra de evidencias_promovibilidade com comportamento observado obrigatorio para flag=nao
- [Phase 02]: Substring match bidirecional para dedup de temas — mais especifico sobrevive
- [Phase 02]: Health history threshold 50 entradas com compressao mensal automatica
- [Phase 02]: Tipos ExternalDataSnapshot definidos localmente no main process index.ts — evita dependencia cross-process
- [Phase 03]: ProfileContext extraido de notas_manuais e ultimas 5 linhas de Notas do perfil.md para deteccao de ausencia
- [Phase 03]: firstReviewTurnaroundDias reutiliza calculo existente de tempoMedioReviewDias
- [Phase 03]: collaborationScore composto por 3 fatores com pesos 30/40/30 (co-authored/cross-repo/reviews)
- [Phase 03]: Baseline calcula media apenas sobre meses com dados (nao zero-fill)
- [Phase 03]: Narrative context construido a partir de PersonConfig sem ler perfil.md
- [Phase 04-03]: Evidence accumulation both from 1:1 deep pass and ceremony signals for broader PDI coverage
- [Phase 04-03]: Fuzzy matching for PDI objectives using first 3 words of each side
- [Phase 04-05]: Dynamic import no Scheduler para evitar circular dependency com index.ts
- [Phase 04-05]: generateAgendaForPerson carrega settings internamente para obter openRouter config
- [Phase 04-04]: CrossTeamInsightsPanel inline no DashboardView para manter consistencia com pattern existente
- [Phase 04-04]: TeamRiskPanel removido do guard relacao === liderado para ser visivel para pares e gestores

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 999.1 | Resumo 1:1 Estilo Qulture Rocks | ✅ Done |
| 999.3 | Ingestion Performance Hybrid Model | ✅ Done |
| 999.4 | OpenRouter Estágio 2 — Pass 1 modelo leve | ✅ Done |
| 999.5 | Gemini Preprocessing Pass | ✅ Done |
| 01 | Prompt Refinements | ✅ Done |
| 02 | Pipeline & Schema | ✅ Done |
| 03 | GitHub Metrics & CrossAnalyzer | ✅ Done |
| 04 | Action System + UX Avancado | ✅ Done |

## Planning Artifacts

- `.planning/PROJECT.md` — project context and requirements
- `.planning/REQUIREMENTS.md` — 6 V2.1 requirements with traceability
- `.planning/ROADMAP.md` — 3-phase roadmap
- `.planning/codebase/` — codebase map (7 documents)

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 999.4 | 01 | 83s | 2/2 | 2 |
| 999.5 | 01 | ~35min | 6/6 | 6 |
| Phase 01 P02 | 5 | 2 tasks | 1 files |
| Phase 02 P01 | 12min | 2 tasks | 1 files |
| Phase 02 P02 | 741 | 1 tasks | 2 files |
| Phase 03 P01 | 114 | 2 tasks | 2 files |
| Phase 03 P03 | 167 | 2 tasks | 5 files |
| 04 | 01 | 2min | 2/2 | 3 |
| 04 | 03 | 3min | 1/1 | 2 |
| 04 | 05 | 140s | 1/1 | 2 |

## Next Action

Phase 04 Wave 1 complete (plans 01, 03, 05). Executing Wave 2 (plans 02, 04).
