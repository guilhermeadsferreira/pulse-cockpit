# MgrCockpit — CLAUDE.md

---

## PM Agent

A documentação de produto deste projeto vive no PM Agent:

**Caminho:** `/Users/guilhermeaugusto/Documents/workspace-projects/pm-agent/projects/mgr-cockpit/`

```
pm-agent/projects/mgr-cockpit/
├── README.md          ← visão PM: o que é, status, decisões-chave
├── PRD.md             ← requisitos de produto (documento vivo)
├── decisions/         ← PDRs (Product Decision Records)
├── tasks/
│   ├── backlog.md     ← features e tarefas planejadas
│   ├── active.md      ← o que está em andamento agora
│   └── done.md        ← concluídas
└── docs/              ← PITCH.md, PRODUCT_STATUS.md (quando criados)
```

**Antes de implementar qualquer feature:** consulte `tasks/backlog.md` e `tasks/active.md` para entender o que está planejado e priorizado.

---

## Tasks locais (auditoria técnica)

Este repo mantém um diretório `/tasks` com o plano de execução da auditoria técnica (TECH.md):

```
tasks/
├── backlog.md    ← tarefas identificadas na auditoria, ainda não iniciadas
├── active.md     ← tarefas em andamento
├── done.md       ← tarefas concluídas (com data e resultado)
└── sequencia.md  ← sequência de execução recomendada (Fase 1 → 2 → 3)
```

Estas tasks são independentes do pm-agent — rastreiam issues técnicas (bugs, débito, arquitetura), não features de produto.

---

## Living Documentation

A documentação de produto vive **no PM Agent**, não neste repo.

**Caminho para docs de produto:** `/Users/guilhermeaugusto/Documents/workspace-projects/pm-agent/projects/mgr-cockpit/docs/`

| Situação | Documento a atualizar |
|----------|----------------------|
| Adicionei, conclui ou removi uma feature | `docs/PRODUCT_STATUS.md` no pm-agent |
| Mudei escopo ou público-alvo | `docs/PITCH.md` no pm-agent |
| Mudei stack, arquitetura, schema, rotas ou convenções técnicas | `PRD_TECH.md` na raiz deste repo |
| Conclui uma task | Mover de `tasks/active.md` para `tasks/done.md` no pm-agent |

A documentação técnica vive em `PRD_TECH.md` na raiz **deste repo**.

### Checklist pré-commit obrigatório

- [ ] Adicionei, conclui ou removi uma feature? → atualizar `docs/PRODUCT_STATUS.md` no pm-agent
- [ ] Mudei stack, arquitetura, schema, rotas ou convenções técnicas? → atualizar `PRD_TECH.md` neste repo
- [ ] Mudei escopo ou público-alvo? → atualizar `docs/PITCH.md` no pm-agent
- [ ] Conclui uma task? → mover de `tasks/active.md` para `tasks/done.md` no pm-agent
- [ ] Atualizei algum doc? → bumpar "Última atualização" nesse doc

---

## IA — Claude Code CLI (OBRIGATÓRIO)

Este projeto usa **Claude Code CLI** (`claude -p`) via `child_process.spawn` no Main Process do Electron.

**Nunca usar:**
- Anthropic API (`@anthropic-ai/sdk`)
- API keys ou variáveis de ambiente com tokens da Anthropic
- Qualquer SDK de terceiro para chamar LLMs

O usuário deve ter o Claude Code CLI instalado e autenticado localmente. O path do binário é detectado via `which claude` e armazenado em `~/.mgrcockpit/settings.json`.

---

## PRD

- **PRD de produto:** `/Users/guilhermeaugusto/Documents/workspace-projects/pm-agent/projects/mgr-cockpit/PRD.md`
- **PRD técnico:** `PRD_TECH.md` (na raiz deste repo)

---

## PRD_TECH — o que atualizar durante a implementação

O `PRD_TECH.md` é o documento vivo da implementação. Atualizar sempre que:

| Mudança | Seção a atualizar |
|---------|------------------|
| Nova dependência adicionada ao package.json | Stack |
| Mudança na estrutura de pastas do projeto | Estrutura de Arquivos do Projeto |
| Mudança no schema do config.yaml ou perfil.md | Modelagem de Dados |
| Novo IPC channel ou mudança de contrato | IPC Channels |
| Mudança no prompt de ingestão/pauta/ciclo | Prompts — Estrutura |
| Fase concluída ou replaneada | Plano de Implementação V1 |
| Novo risco identificado ou mitigado | Riscos Técnicos |
| Scripts npm definidos na Fase 0 | Comandos |
