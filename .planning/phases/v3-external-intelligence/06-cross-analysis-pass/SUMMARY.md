---
phase: v3-06-cross-analysis-pass
plan: "01"
subsystem: ingestion
tags: [pipeline, cross-analysis, scheduler, cache, external-data]

dependency_graph:
  requires:
    - phase: v3-05-external-clients
      provides: JiraClient, GitHubClient, JiraMetrics, GitHubMetrics
  provides:
    - ExternalDataPass integrado ao IngestionPipeline
    - CrossAnalyzer com lógica programática
    - Scheduler para triggers automáticos
    - Acumulação histórica em external_data.yaml
  affects:
    - src/main/ingestion/IngestionPipeline.ts
    - src/main/ingestion/ArtifactWriter.ts
    - src/main/registry/DemandaRegistry.ts

tech_stack:
  added: []
  patterns:
    - "ExternalDataPass após syncItemToPerson, antes do 1:1 Deep"
    - "Cache de 1h por pessoa em ~/.pulsecockpit/cache/external/"
    - "Graceful degradation — falha de API nunca para ingestão"
    - "CrossAnalyzer sem IA — lógica programática com thresholds"
    - "Acumulação mensal no external_data.yaml (aditivo)"

key_files:
  created:
    - src/main/ingestion/ExternalDataPass.ts
    - src/main/external/CrossAnalyzer.ts
    - src/main/external/Scheduler.ts
  modified:
    - src/main/ingestion/IngestionPipeline.ts
    - src/main/ingestion/ArtifactWriter.ts
    - src/main/registry/DemandaRegistry.ts

requirements-completed:
  - EXT-07 (ExternalDataPass)
  - EXT-08 (CrossAnalyzer)
  - EXT-09 (Scheduler)
  - EXT-10 (Acumulação histórica)

metrics:
  duration: TBD
  completed: TBD
---

# Phase 6: Cross-Analysis Pass — Summary

**One-liner:** Integra ExternalDataPass no pipeline de ingestão, cria CrossAnalyzer com lógica programática, Scheduler para triggers automáticos, e acumulação histórica em external_data.yaml.

## Status

⬜ Phase 6 não iniciada
