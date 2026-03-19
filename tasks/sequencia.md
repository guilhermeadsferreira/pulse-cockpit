# Sequência de Execução — Pulse Cockpit

> Última atualização: 2026-03-19

---

## Fase 1 — Bloqueadores (semana 1)

| # | Task | Motivo |
|---|------|--------|
| 1 | **T5.1** Schema migration | Fazer PRIMEIRO — toda mudança de schema depende disso |
| 2 | **T2.3** Remover `acoes_pendentes_count` | Elimina fonte de verdade duplicada antes de adicionar dados novos |
| 3 | **T1.1** Corrigir `perfilMdRaw: null` | Bug central — desbloqueia todas as melhorias de extração |

---

## Fase 2 — Estabilização (semana 2)

| # | Task | Depende de |
|---|------|------------|
| 4 | **T1.2** Validação de schema AI | — |
| 5 | **T1.3** Novos campos no schema | — |
| 6 | **T2.1** Modelo Action atualizado | T5.1 |
| 7 | **T2.2** ActionRegistry com prazo | T1.3, T2.1 |
| 8 | **T3.1** Não sobrescrever resumo_evolutivo | T1.1 |
| 9 | **T4.2** Decay de alertas stale | — |

---

## Fase 3 — Valor incremental (semana 3)

| # | Task | Depende de |
|---|------|------------|
| 10 | **T4.1** Alerta frequência 1:1 | — |
| 11 | **T3.2** Resolução de pontos de atenção | T1.1 |
| 12 | **T3.3** `ultimo_1on1` por contexto | T1.1 |
| 13 | **T2.4** Ações coletivas com dono | T2.1, T2.2 |
| 14 | **T4.3** Alertas de ações vencidas | T2.1, T2.2 |
| 15 | **T4.4** Visão agregada do time | T4.1, T4.3 |
| 16 | **T5.2** Pipeline paralelo | — |

---

## Riscos de Execução

| Risco | Área | Mitigação |
|-------|------|-----------|
| T5.1 feita depois de T2/T3 — perfis corrompidos | Schema | T5.1 é a primeira task, sem exceção |
| T3.1 gera prompt muito longo com perfil completo | IA | Limitar perfil a últimos N blocos do histórico |
| T2.3 quebra UI que lê `acoes_pendentes_count` | UI | Grep completo antes de remover; substituir por chamada ao ActionRegistry |
| T1.1 aumenta tamanho do prompt em ~30% | IA | Medir tokens; se necessário, truncar seções menos relevantes do perfil |
| T5.2 com Claude CLI pode gerar conflitos de arquivo | Infra | Garantir escrita em arquivos separados; lock em `perfil.md` por pessoa |
