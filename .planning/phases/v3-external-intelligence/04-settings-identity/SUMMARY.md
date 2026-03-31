---
phase: v3-04-settings-identity
plan: "01"
subsystem: settings
tags: [jira, github, settings, identity, configuration]

dependency_graph:
  requires:
    - nothing
  provides:
    - Configuração de API Jira e GitHub no AppSettings
    - Mapeamento de identidade externa no PersonConfig
    - UI de configuração nas SettingsView e PersonFormView
  affects:
    - src/main/registry/SettingsManager.ts
    - src/renderer/src/types/ipc.ts
    - src/renderer/src/views/SettingsView.tsx
    - src/main/registry/PersonRegistry.ts
    - src/renderer/src/views/PersonFormView.tsx

tech_stack:
  added: []
  patterns:
    - "Extensão de AppSettings com campos opcionais (backwards compatible)"
    - "Toggle desabilitado quando dependência ausente (mesmo padrão Gemini/OpenRouter)"
    - "Campos sensíveis com type=password"

key_files:
  created: []
  modified:
    - src/main/registry/SettingsManager.ts
    - src/renderer/src/types/ipc.ts
    - src/renderer/src/views/SettingsView.tsx
    - src/main/registry/PersonRegistry.ts
    - src/renderer/src/views/PersonFormView.tsx

key-decisions:
  - "Campos de configuração todos opcionais (?) — não quebra comportamento existente"
  - "githubRepos como string[] — parse de vírgula na UI, array no storage"
  - "dailyReportTime como string ('09:00') — parse simples, não necessita Date"
  - "Seção 'Relatórios' separada das integrações — são switches independentes"

patterns-established:
  - "Settings section pattern: collapse com ícone, campos, toggle de ativação"
  - "Identity mapping pattern: campos no config.yaml de cada pessoa"

requirements-completed:
  - EXT-01 (AppSettings + SettingsView)
  - EXT-02 (PersonConfig + PersonFormView)

metrics:
  duration: TBD
  completed: TBD
---

# Phase 4: Settings + Identity — Summary

**One-liner:** Estende AppSettings com configurações de Jira/GitHub e PersonConfig com identidade externa, com UI nas SettingsView e PersonFormView.

## Problema Resolvido

O Pulse Cockpit precisa de tokens de API e mapeamento de identidade antes de
qualquer integração externa poder funcionar. Esta fase cria a infraestrutura
de configuração.

## O que foi implementado

1. **AppSettings estendido** — 11 novos campos (Jira: 6, GitHub: 3, Reports: 2)
2. **SettingsView** — 3 novas seções (Jira, GitHub, Relatórios)
3. **PersonConfig estendido** — 2 novos campos (jiraEmail, githubUsername)
4. **PersonFormView** — 1 nova seção (Identidade Externa)

## Status

⬜ Phase 4 não iniciada
