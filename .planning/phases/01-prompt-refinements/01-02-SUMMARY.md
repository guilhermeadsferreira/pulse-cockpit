---
phase: 01-prompt-refinements
plan: 02
subsystem: prompts
tags: [cycle-prompt, promovibilidade, linha-do-tempo, evolucao-cargo, prmt-08, prmt-09, prmt-10]
dependency_graph:
  requires: []
  provides: [PRMT-08, PRMT-09, PRMT-10]
  affects: [cycle.prompt.ts, CycleAIResult.evidencias_promovibilidade, relatorio-ciclo]
tech_stack:
  added: []
  patterns: [prompt-engineering, behavioral-evidence, cargo-benchmarking]
key_files:
  created: []
  modified:
    - src/main/prompts/cycle.prompt.ts
decisions:
  - "PRMT-10 implementado via substituicao cirurgica da regra de evidencias_promovibilidade — sem alterar outros campos do JSON schema"
  - "Exemplos concretos (Senior, Staff) embutidos no prompt para calibrar output da IA nos casos negativos"
metrics:
  duration: ~5min
  completed: 2026-03-31
  tasks_completed: 2
  files_modified: 1
requirements:
  - PRMT-08
  - PRMT-09
  - PRMT-10
---

# Phase 01 Plan 02: Cycle Prompt — linha_do_tempo, evolucao_frente_ao_cargo e evidencias_promovibilidade Summary

**One-liner:** Regras de densidade flexivel (5-10 eventos), benchmarking por cargo/nivel e evidencias comportamentais obrigatorias para flag=nao implementadas em cycle.prompt.ts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | PRMT-08 e PRMT-09 — auditoria e correcao | cb294c6 | src/main/prompts/cycle.prompt.ts |
| 2 | PRMT-10 — evidencias com comportamento observado | 7ed77d6 | src/main/prompts/cycle.prompt.ts |

## What Was Built

### Task 1: PRMT-08 e PRMT-09

**PRMT-08 — linha_do_tempo flexivel:**
- Regra anterior: "ate 10 eventos-chave"
- Regra nova: "entre 5 e 10 eventos-chave do periodo em ordem cronologica. Minimo de 5 itens — se o periodo for rico, inclua ate 10. Inclua entregas, marcos, mudancas, incidentes relevantes e momentos de virada (feedbacks recebidos, reconhecimentos, bloqueios superados)."
- Impacto: IA agora gera linha do tempo calibrada por significancia, nao apenas trunca em 10

**PRMT-09 — evolucao_frente_ao_cargo benchmarked:**
- Regra anterior: descricao narrativa generica sem ancora de cargo
- Regra nova: adiciona "OBRIGATORIO: ancore em expectativas do nivel (use o campo 'cargo' do perfil como referencia)" + exemplo concreto de Senior
- Impacto: output sempre contextualizado ao nivel esperado, nao avaliacao absoluta

### Task 2: PRMT-10

**PRMT-10 — evidencias_promovibilidade com comportamento observado:**
- Regra anterior: "Se flag_promovibilidade for 'nao', liste as lacunas ou areas que ainda precisam ser demonstradas para uma futura promocao."
- Regra nova: estrutura explicita para flag=nao com 3 componentes obrigatorios: (a) comportamento esperado para o nivel, (b) o que foi observado ou nao no ciclo, (c) evidencia comportamental concreta
- Proibe linguagem vaga sem evidencia ("falta experiencia", "nao esta pronto")
- Adiciona exemplos de formato correto para Senior e Staff
- Para flag=condicionado_a: lista positivos JA demonstrados + gap especifico restante
- Impacto: casos negativos agora geram bullets acionaveis e citateis no forum de calibracao

## Verification Results

```
grep -c "5 e 10" src/main/prompts/cycle.prompt.ts         → 1 (PASS)
grep -c "ancore em expectativas" src/main/prompts/cycle.prompt.ts → 1 (PASS)
grep -c "comportamento esperado" src/main/prompts/cycle.prompt.ts → 1 (PASS)
grep -c 'flag = "nao"' src/main/prompts/cycle.prompt.ts   → 1 (PASS)
npx tsc --noEmit --skipLibCheck (cycle.prompt errors)     → 0 (PASS)
```

## Deviations from Plan

None — plano executado exatamente como escrito. Os dois requisitos (PRMT-08/PRMT-09 como auditoria/correcao e PRMT-10 como implementacao nova) foram aplicados cirurgicamente sem alterar outros campos ou logica.

## Known Stubs

None — todas as regras implementadas sao funcionais e fluem diretamente para o output da IA no relatorio de ciclo.

## Self-Check: PASSED

- [x] src/main/prompts/cycle.prompt.ts modificado e verificado
- [x] Commit cb294c6 existe (Task 1)
- [x] Commit 7ed77d6 existe (Task 2)
- [x] TypeScript compila sem erros em cycle.prompt.ts
