---
phase: v3-08-ui-integration
plan: "01"
subsystem: renderer
tags: [ui, reports, person-view, dashboard, sidebar, prompts]

dependency_graph:
  requires:
    - phase: v3-07-reports
      provides: Reports gerados no workspace, Scheduler, external_data.yaml
  provides:
    - RelatóriosView com lista e preview
    - PersonView com seção "Dados Externos"
    - Dashboard com triggers quantitativos
    - Prompts enriquecidos com externalData?
  affects:
    - src/renderer/src/views/RelatóriosView.tsx
    - src/renderer/src/views/PersonView.tsx
    - src/renderer/src/views/DashboardView.tsx
    - src/renderer/src/components/Sidebar.tsx
    - src/renderer/src/router.tsx
    - src/main/prompts/agenda.prompt.ts
    - src/main/prompts/cycle.prompt.ts

tech_stack:
  added: []
  patterns:
    - "react-markdown para preview de relatórios (já existe no projeto)"
    - "Cards com métricas — padrão visual consistente com TeamRiskPanel"
    - "externalData como parâmetro opcional nos prompts (backwards compatible)"
    - "Estado vazio para pessoa sem identidade externa"

key_files:
  created:
    - src/renderer/src/views/RelatóriosView.tsx
  modified:
    - src/renderer/src/views/PersonView.tsx
    - src/renderer/src/views/DashboardView.tsx
    - src/renderer/src/components/Sidebar.tsx
    - src/renderer/src/router.tsx
    - src/main/prompts/agenda.prompt.ts
    - src/main/prompts/cycle.prompt.ts

requirements-completed:
  - EXT-13 (RelatóriosView)
  - EXT-14 (PersonView + Dashboard)
  - EXT-15 (Prompts enriquecidos)

metrics:
  duration: TBD
  completed: TBD
---

# Phase 8: UI Integration — Summary

**One-liner:** Torna dados externos visíveis na UI — RelatóriosView, seção "Dados Externos" na PersonView, triggers quantitativos no Dashboard, e prompts de agenda/cycle enriquecidos.

## Status

⬜ Phase 8 não iniciada
