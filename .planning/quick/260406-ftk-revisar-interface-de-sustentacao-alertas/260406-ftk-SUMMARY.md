---
phase: quick
plan: 260406-ftk
subsystem: sustentacao-ui
tags: [layout, scroll, alertas, ui-fix]
dependency_graph:
  requires: []
  provides: [sustentacao-alertas-scroll-integrado]
  affects: [SustentacaoView]
tech_stack:
  added: []
  patterns: []
key_files:
  modified:
    - src/renderer/src/views/SustentacaoView.tsx
decisions:
  - "AlertasBanner movido para dentro do container scrollável — alertas fazem parte do fluxo de leitura, não são um painel fixo separado"
  - "marginBottom: 20 no container raiz de AlertasBanner substitui margin: '0 40px 16px' — o pai já tem padding: '28px 40px', sem duplicar espaçamento horizontal"
  - "Header interno dos alertas fica como flex row simples com marginBottom: 8 — sticky só fazia sentido no sub-scroll que foi removido"
metrics:
  duration: 3min
  completed_date: "2026-04-06"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Quick Fix 260406-ftk: Alertas de Sustentação Integrados ao Scroll

**One-liner:** Alertas proativos movidos de bloco externo com maxHeight/scroll isolado para dentro do container scrollável da view, eliminando o sub-scroll artificial.

## What Was Done

A `SustentacaoView` tinha o componente `AlertasBanner` renderizado fora do div scrollável principal. Isso criava um bloco de altura fixa (`maxHeight: 35vh`) com scroll isolado entre o header da página e o conteúdo real — quebrando o fluxo de leitura e dificultando a navegação quando havia muitos alertas.

Foram feitas três mudanças cirúrgicas, sem alteração de lógica:

1. **Removido `AlertasBanner` de fora do container scrollável** (entre o bloco de erro e o div de conteúdo)
2. **Inserido `AlertasBanner` como primeira seção dentro do div com `overflowY: 'auto'`**, antes dos Compliance Cards — agora é a primeira coisa visível ao entrar na view
3. **Limpeza de estilos do componente `AlertasBanner`:**
   - Removidos `maxHeight: '35vh'` e `overflowY: 'auto'` do container raiz
   - Removidos `position: 'sticky'`, `top: 0`, `background`, `zIndex` do header interno
   - Substituído `margin: '0 40px 16px'` por `marginBottom: 20` (o pai já tem `padding: '28px 40px'`)
   - Header interno passou a usar `marginBottom: 8` para espaçamento simples

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Mover AlertasBanner para dentro do container scrollável e limpar estilos | b3b53e8 | src/renderer/src/views/SustentacaoView.tsx |

## Deviations from Plan

None — plano executado exatamente como escrito.

## Known Stubs

None.

## Self-Check: PASSED

- `src/renderer/src/views/SustentacaoView.tsx` — modified and committed (b3b53e8)
- `npx tsc --noEmit` — sem erros TypeScript
- AlertasBanner dentro do div scrollável: confirmado via leitura do arquivo (linhas 757-761)
- Nenhum `maxHeight`, `overflowY: 'auto'`, `position: sticky` ou `zIndex` nos estilos do componente: confirmado via leitura (linhas 362-381)
