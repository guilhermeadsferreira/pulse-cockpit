---
phase: v3-07-reports
plan: "01"
subsystem: reports
tags: [daily, sprint, reports, markdown, scheduler]

dependency_graph:
  requires:
    - phase: v3-06-cross-analysis-pass
      provides: Scheduler, JiraClient, GitHubClient
  provides:
    - DailyReportGenerator — daily_YYYY-MM-DD.md
    - SprintReportGenerator — sprint_{nome}.md
  affects:
    - src/main/external/Scheduler.ts
    - src/main/workspace/WorkspaceSetup.ts

tech_stack:
  added: []
  patterns:
    - "Relatórios como .md no workspace — mesmo padrão de artefatos"
    - "Templates preenchidos com dados — sem IA necessária"
    - "Não sobrescrever se arquivo já existe para a data"

key_files:
  created:
    - src/main/external/DailyReportGenerator.ts
    - src/main/external/SprintReportGenerator.ts
  modified:
    - src/main/external/Scheduler.ts
    - src/main/workspace/WorkspaceSetup.ts

requirements-completed:
  - EXT-11 (DailyReportGenerator)
  - EXT-12 (SprintReportGenerator)

metrics:
  duration: TBD
  completed: TBD
---

# Phase 7: Reports — Summary

**One-liner:** Gera relatórios periódicos (.md) no workspace — daily report ao abrir o app e sprint report no início/fim de sprint.

## Status

⬜ Phase 7 não iniciada
