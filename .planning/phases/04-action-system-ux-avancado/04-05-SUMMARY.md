---
phase: 04-action-system-ux-avancado
plan: 05
subsystem: scheduler, agenda-generation
tags: [auto-agenda, scheduler, 1on1, pauta]
dependency_graph:
  requires: []
  provides: [auto-agenda-generation, generateAgendaForPerson-export]
  affects: [src/main/index.ts, src/main/external/Scheduler.ts]
tech_stack:
  added: []
  patterns: [dynamic-import-circular-dependency, function-extraction-for-reuse]
key_files:
  created: []
  modified:
    - src/main/index.ts
    - src/main/external/Scheduler.ts
decisions:
  - Dynamic import no Scheduler para evitar circular dependency com index.ts
  - Settings carregado dentro de generateAgendaForPerson para obter openRouter config
metrics:
  duration: 140s
  completed: 2026-03-31
---

# Phase 04 Plan 05: Agenda Auto-Generation Summary

Scheduler gera pautas de 1:1 automaticamente 2 dias antes do proximo encontro esperado, usando funcao generateAgendaForPerson extraida do handler IPC e chamada diretamente (sem BrowserWindow/executeJavaScript).

## What Was Done

### Task 1: Extrair generateAgendaForPerson e implementar checkAgendaGeneration no Scheduler

**Commit:** 1acc7af

**Parte A -- Extrair funcao reutilizavel:**
- Criada `export async function generateAgendaForPerson(slug, workspacePath, claudeBinPath)` em index.ts
- Contem toda a logica de geracao de pauta (liderado, gestor, par) identica ao handler original
- Handler IPC `ai:generate-agenda` refatorado para delegar a funcao extraida

**Parte B -- checkAgendaGeneration no Scheduler:**
- Adicionada constante `AGENDA_DAYS_BEFORE = 2`
- Metodo `checkAgendaGeneration()` itera liderados, calcula proximo 1:1 baseado em `ultimo_1on1 + frequencia_1on1_dias`
- Verifica se ja existe pauta recente (ultimos 3 dias) para evitar duplicacao
- Gera pauta via `generateAgendaForPerson` com dynamic import (evita circular dependency)
- Falhas sao graceful: log warning e continua para proxima pessoa

**Parte C -- Integrar no onAppStart:**
- `checkAgendaGeneration()` chamado apos o bloco de daily report no `onAppStart()`
- Erros capturados com try/catch para nunca interromper o startup

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Settings necessario para openRouter config**
- **Found during:** Task 1 (Parte A)
- **Issue:** A funcao extraida precisa de `settings` completo (nao apenas claudeBinPath) para chamar `runWithProvider` que usa openRouter config
- **Fix:** Carregado `SettingsManager.load()` dentro da funcao para obter settings completo; claudeBinPath continua como parametro para consistencia com a interface
- **Files modified:** src/main/index.ts

## Decisions Made

1. **Dynamic import para circular dependency:** Scheduler.ts usa `await import('../index')` em vez de import estatico porque index.ts ja importa Scheduler. Dynamic import resolve em runtime sem problemas.
2. **Settings carregado internamente:** generateAgendaForPerson carrega settings via SettingsManager.load() para ter acesso ao openRouter config necessario para runWithProvider, mas recebe claudeBinPath como parametro para manter a assinatura prevista no plano.

## Known Stubs

None -- toda a funcionalidade foi implementada completamente.

## Self-Check: PASSED
