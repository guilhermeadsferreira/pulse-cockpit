---
phase: 03-github-metrics-crossanalyzer
plan: 03
subsystem: external
tags: [reports, metrics, baseline, narrative, ui]

requires:
  - phase: 03-github-metrics-crossanalyzer
    plan: 01
    provides: "GitHubPersonMetrics com avgCommentsPerReview, approvalRate, collaborationScore, testCoverageRatio"
  - phase: 03-github-metrics-crossanalyzer
    plan: 02
    provides: "CrossInsight com causa_raiz, ProfileContext, extractProfileContext"
provides:
  - "extractNarrativeContext para contexto humano nos relatorios"
  - "computeBaseline3Months para comparacao pessoal historica"
  - "Relatorios weekly/monthly com narrativa e baseline"
  - "ExternalDataCard com 5 novas metricas e causa_raiz"
affects: []

tech-stack:
  added: []
  patterns:
    - "Narrative context via PersonConfig (nao perfil.md) para performance"
    - "Baseline 3 meses com media ponderada por meses com dados"

key-files:
  created: []
  modified:
    - src/main/external/ExternalDataPass.ts
    - src/main/external/WeeklyReportGenerator.ts
    - src/main/external/MonthlyReportGenerator.ts
    - src/renderer/src/components/ExternalDataCard.tsx
    - src/main/index.ts

key-decisions:
  - "Baseline calcula media apenas sobre meses com dados (nao zero-fill)"
  - "Narrative context construido a partir de PersonConfig (config.yaml) sem ler perfil.md"

patterns-established:
  - "Report generators consomem extractNarrativeContext e computeBaseline3Months do ExternalDataPass"

requirements-completed: [MTRC-06, MTRC-07]

duration: 3min
completed: 2026-03-31
---

# Phase 03 Plan 03: Narrative Context, Baseline Comparison e Metricas Avancadas na UI

**Relatorios weekly/monthly com paragrafo narrativo do perfil e baseline pessoal 3 meses; ExternalDataCard exibindo review depth, collaboration score, test coverage e causa raiz dos insights**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T01:34:53Z
- **Completed:** 2026-04-01T01:37:40Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- summarizeGithub preserva novos campos (avgCommentsPerReview, approvalRate, collaborationScore, testCoverageRatio) no historico
- extractNarrativeContext constroi paragrafo humano a partir do PersonConfig (nome, cargo, nivel, area, PDI, promocao)
- computeBaseline3Months calcula media de commits, PRs e reviews dos ultimos 3 meses
- WeeklyReportGenerator e MonthlyReportGenerator incluem blockquote narrativo e linha de baseline pessoal
- ExternalDataCard exibe 5 novas metricas GitHub e causa_raiz nos insights cruzados
- Tipos locais no index.ts (ExternalGitHubSnapshot, ExternalCrossInsight) atualizados com novos campos opcionais

## Task Commits

Each task was committed atomically:

1. **Task 1: Atualizar summarizeGithub, adicionar extractNarrativeContext e computeBaseline3Months** - `89b1b76` (feat)
2. **Task 2: Injetar narrativa e baseline nos relatorios weekly/monthly e atualizar ExternalDataCard** - `dde0117` (feat)

## Files Created/Modified
- `src/main/external/ExternalDataPass.ts` - Novos metodos extractNarrativeContext e computeBaseline3Months, summarizeGithub atualizado
- `src/main/external/WeeklyReportGenerator.ts` - Narrativa blockquote e baseline pessoal por pessoa
- `src/main/external/MonthlyReportGenerator.ts` - Narrativa blockquote e baseline pessoal por pessoa
- `src/renderer/src/components/ExternalDataCard.tsx` - 5 novas DataRows GitHub e causa_raiz nos insights
- `src/main/index.ts` - ExternalGitHubSnapshot e ExternalCrossInsight com novos campos opcionais

## Decisions Made
- Baseline calcula media apenas sobre meses com dados (evita divisao por zero e zero-fill que distorceria metricas)
- Narrative context construido a partir de PersonConfig (config.yaml) sem ler perfil.md — mais rapido e confiavel

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 03 completa — todas as 3 plans executadas
- GitHub metrics enriquecidas (review depth, collaboration, test coverage) fluem do fetch ao historico a UI
- CrossAnalyzer com causa_raiz e contexto de ausencia
- Relatorios com narrativa humana e baseline pessoal

---
*Phase: 03-github-metrics-crossanalyzer*
*Completed: 2026-03-31*
