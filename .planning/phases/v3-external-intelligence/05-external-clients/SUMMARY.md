---
phase: v3-05-external-clients
plan: "01"
subsystem: external
tags: [jira, github, api, client, metrics]

dependency_graph:
  requires:
    - phase: v3-04-settings-identity
      provides: Configuração de tokens no AppSettings
  provides:
    - JiraClient e GitHubClient funcionais
    - Métricas estruturadas por pessoa (JiraPersonMetrics, GitHubPersonMetrics)
  affects: []

tech_stack:
  added:
    - "@octokit/rest (GitHub SDK oficial)"
  patterns:
    - "Basic Auth para Jira (email:token base64)"
    - "@octokit/rest para GitHub (PAT fine-grained)"
    - "Rate limiting com backoff exponencial"

key_files:
  created:
    - src/main/external/JiraClient.ts
    - src/main/external/JiraMetrics.ts
    - src/main/external/GitHubClient.ts
    - src/main/external/GitHubMetrics.ts
  modified: []

requirements-completed:
  - EXT-03 (JiraClient)
  - EXT-04 (JiraMetrics)
  - EXT-05 (GitHubClient)
  - EXT-06 (GitHubMetrics)

metrics:
  duration: TBD
  completed: TBD
---

# Phase 5: External Clients — Summary

**One-liner:** Cria clientes HTTP para Jira e GitHub com autenticação, rate limiting e transformação de dados brutos em métricas estruturadas por pessoa.

## Status

⬜ Phase 5 não iniciada
