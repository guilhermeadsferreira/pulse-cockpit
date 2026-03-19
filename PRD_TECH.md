# PRD_TECH — Pulse Cockpit

> Documento vivo — atualizar a cada mudança de stack, arquitetura, schema ou convenção técnica relevante.

**Criado em:** 2026-03-18
**Status:** V1 concluída · Auditoria técnica implementada (3 fases) · Estável
**Última atualização:** 2026-03-19

---

## Stack

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Runtime | Electron + Node.js 20 | Desktop nativo, acesso a FS, sem servidor |
| UI | React 18 + TypeScript | Ecossistema maduro, tipagem forte |
| Estilo | Tailwind CSS + shadcn/ui | Produtividade alta, dark mode fácil |
| IA | Claude Code CLI (`claude -p`) | Usa subscription do usuário — **sem API key** |
| Armazenamento | Sistema de arquivos (Markdown + YAML) | Transparente, portável, editável, versionável |
| File watching | chokidar | Watch robusto de diretórios no Electron |
| PDF parsing | pdf-parse | Extrai texto de PDFs simples |
| YAML | js-yaml | Parse/stringify de config.yaml e actions.yaml |
| Build tool | electron-vite | Dev server + build orquestrado (main, preload, renderer) |
| Build/package | electron-builder | Empacotamento para macOS (dmg) |

> **IMPORTANTE:** A IA é invocada via `child_process.spawn('claude', ['-p', prompt])` no Main Process.
> Nunca usar Anthropic API ou API key. O usuário deve ter o Claude Code CLI instalado e autenticado localmente.

---

## Arquitetura

```
Main Process (Node.js)
├── index.ts — BrowserWindow, lifecycle, todos os IPC handlers
├── ingestion/
│   ├── FileWatcher — chokidar, monitora inbox/
│   ├── IngestionPipeline — fila paralela (max 3 simultâneos) + per-person lock
│   ├── FileReader — lê .md/.txt/.pdf
│   ├── ClaudeRunner — spawn do CLI headless + retry + parse JSON
│   ├── ArtifactWriter — escreve artefato e atualiza perfil.md atomicamente
│   └── SchemaValidator — valida schema do JSON retornado pelo Claude
├── registry/
│   ├── PersonRegistry — CRUD de pessoas + getPerfil (com migration automática)
│   ├── ActionRegistry — CRUD de ações estruturadas (actions.yaml)
│   ├── DetectedRegistry — pessoas detectadas, não cadastradas
│   └── SettingsManager — ~/.pulsecockpit/settings.json
├── migration/
│   └── ProfileMigration — migra perfil.md entre schema versions
├── prompts/
│   ├── ingestion.prompt.ts
│   ├── agenda.prompt.ts
│   ├── agenda-gestor.prompt.ts  ← pauta com o próprio gestor (roll-up do time)
│   └── cycle.prompt.ts
└── workspace/
    └── WorkspaceSetup — cria estrutura de pastas + templates de artefato

Renderer Process (React)
├── App.tsx — RouterProvider + Layout shell
├── router.tsx — history stack simples (sem react-router)
├── views/
│   ├── DashboardView — grid de cards + TeamRiskPanel (visão de risco do time)
│   ├── InboxView — drop zone + fila de processamento
│   ├── PersonView — cockpit individual (perfil, artefatos, pautas, relatório)
│   ├── PersonFormView — formulário de cadastro/edição de pessoa
│   ├── MeetingsFeedView — feed global de artefatos
│   ├── SettingsView — workspace, Claude CLI, notificações
│   └── SetupView — tela de verificação do ambiente (primeira abertura)
├── components/
│   ├── Sidebar.tsx — nav principal + footer do gestor
│   ├── Layout.tsx — wrapper com sidebar fixa
│   └── MarkdownPreview.tsx — renderização de markdown com react-markdown
└── lib/utils.ts — labelNivel, labelRelacao, daysSince, etc.

IPC Bridge (preload/index.ts)
└── contextBridge → window.api (ping, settings, people, artifacts, detected, ingestion, ai, shell, actions)
```

---

## Estrutura de Arquivos do Projeto

```
mgr-cockpit/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
│
├── tasks/                           # Backlog local de implementação
│   ├── backlog.md
│   ├── active.md
│   ├── done.md
│   └── sequencia.md
│
├── src/
│   ├── main/
│   │   ├── index.ts                 # BrowserWindow, lifecycle, TODOS os IPC handlers
│   │   ├── ingestion/
│   │   │   ├── FileWatcher.ts
│   │   │   ├── IngestionPipeline.ts
│   │   │   ├── FileReader.ts
│   │   │   ├── ClaudeRunner.ts
│   │   │   ├── ArtifactWriter.ts
│   │   │   └── SchemaValidator.ts   # valida JSON do Claude antes de usar
│   │   ├── registry/
│   │   │   ├── PersonRegistry.ts
│   │   │   ├── ActionRegistry.ts    # ações estruturadas (actions.yaml por pessoa)
│   │   │   ├── DetectedRegistry.ts
│   │   │   └── SettingsManager.ts
│   │   ├── migration/
│   │   │   └── ProfileMigration.ts  # migração automática de perfil.md entre versões
│   │   ├── prompts/
│   │   │   ├── ingestion.prompt.ts
│   │   │   ├── agenda.prompt.ts
│   │   │   ├── agenda-gestor.prompt.ts
│   │   │   └── cycle.prompt.ts
│   │   └── workspace/
│   │       └── WorkspaceSetup.ts    # cria dirs + templates de artefato
│   │
│   ├── preload/
│   │   └── index.ts                 # contextBridge — window.api
│   │
│   └── renderer/src/
│       ├── main.tsx / App.tsx / router.tsx
│       ├── types/
│       │   ├── ipc.ts               # tipos compartilhados main/renderer
│       │   └── global.d.ts
│       ├── views/
│       │   ├── DashboardView.tsx    # suporta prop relacao + TeamRiskPanel
│       │   ├── InboxView.tsx
│       │   ├── PersonView.tsx
│       │   ├── PersonFormView.tsx
│       │   ├── MeetingsFeedView.tsx
│       │   ├── SettingsView.tsx
│       │   └── SetupView.tsx
│       ├── components/
│       │   ├── Sidebar.tsx
│       │   ├── Layout.tsx
│       │   └── MarkdownPreview.tsx
│       └── lib/utils.ts
```

---

## Modelagem de Dados

### Workspace (~Pulse Cockpit/)

```
~/Pulse Cockpit/
  inbox/                     ← drop zone monitorada pelo FileWatcher
    processados/             ← arquivos após ingestão
  artefatos/
    1on1/
      template.md            ← template de artefato (criado no setup, nunca sobrescrito)
    reuniao/template.md
    feedback/template.md
    planning/template.md
    retro/template.md
    daily/template.md
  pessoas/
    {slug}/
      config.yaml            ← configuração manual (quem é, cargo, relação)
      perfil.md              ← cockpit vivo (atualizado pela IA a cada ingestão)
      actions.yaml           ← ações estruturadas (CRUD via ActionRegistry)
      historico/             ← artefatos vinculados a essa pessoa
      pautas/                ← pautas geradas
    _coletivo/
      historico/             ← artefatos de reuniões sem pessoa_principal
  exports/                   ← relatórios de ciclo gerados
```

### config.yaml (por pessoa)

```yaml
schema_version: 1
nome: "Maria Silva"
slug: "maria-silva"
cargo: "Engenheira de Software"
nivel: "senior"               # junior | pleno | senior | staff | principal | manager
area: "Plataforma"
squad: "Core Infrastructure"
relacao: "liderado"           # liderado | par | gestor | stakeholder
inicio_na_funcao: "2024-06-01"
inicio_na_empresa: "2022-03-15"
frequencia_1on1_dias: 14
em_processo_promocao: false
objetivo_cargo_alvo: "staff"
pdi:
  - objetivo: "Melhorar comunicação com stakeholders"
    status: "em_andamento"   # nao_iniciado | em_andamento | concluido
    prazo: "2026-06-30"
notas_manuais: |
  Está passando por mudança de time desde fevereiro.
alerta_ativo: false
motivo_alerta: null
criado_em: "2026-03-18T10:00:00Z"
atualizado_em: "2026-03-18T10:00:00Z"
```

### perfil.md — frontmatter (schema_version: 2)

```yaml
slug: "maria-silva"
schema_version: 2            # v1→v2: removeu acoes_pendentes_count
ultima_atualizacao: "2026-03-19T14:30:00Z"
ultima_ingestao: "2026-03-19" # atualizado a cada ingestão bem-sucedida
total_artefatos: 7
ultimo_1on1: "2026-03-15"    # atualizado em tipo=1on1 OU necessita_1on1=false
alertas_ativos: []
saude: "verde"
necessita_1on1: false
motivo_1on1: null
alerta_estagnacao: false
motivo_estagnacao: null
sinal_evolucao: true
evidencia_evolucao: "Liderou refatoração do serviço de auth"
```

> `acoes_pendentes_count` foi removido do frontmatter. Calculado em runtime pelo `ActionRegistry`.
> `dados_stale: boolean` é injetado pelo IPC handler (não persistido no arquivo).

### actions.yaml (por pessoa)

```yaml
actions:
  - id: "2026-03-15-maria-silva-0"
    personSlug: "maria-silva"
    texto: "Maria Silva: apresentar proposta de observabilidade até 2026-03-22"
    responsavel: "Maria Silva"
    responsavel_slug: "maria-silva"
    prazo: "2026-03-22"         # YYYY-MM-DD ou null
    owner: "liderado"           # gestor | liderado | terceiro
    prioridade: "media"         # baixa | media | alta
    status: "open"              # open | in_progress | done | cancelled
    criadoEm: "2026-03-15"
    concluidoEm: null
    fonteArtefato: "2026-03-15-maria-silva.md"
```

### Schema migration

O módulo `ProfileMigration.ts` migra `perfil.md` automaticamente na leitura:

| De | Para | Mudança |
|----|------|---------|
| v1 | v2 | remove `acoes_pendentes_count` do frontmatter |

A migração é transparente — aplicada em `PersonRegistry.getPerfil()` e persistida no disco se o conteúdo mudou.

---

## IPC Channels

### Contrato geral

- Channels `renderer → main`: `ipcMain.handle` (retorna Promise)
- Channels `main → renderer`: `mainWindow.webContents.send`
- Todos os tipos de payload exportados de `src/renderer/types/ipc.ts`

### Channels

| Channel | Direção | Descrição |
|---------|---------|-----------|
| `ipc:ping` | renderer → main | Health check |
| `settings:load` | renderer → main | Carrega AppSettings |
| `settings:save` | renderer → main | Persiste AppSettings |
| `settings:detect-claude` | renderer → main | Roda `zsh -l -c "which claude"` |
| `settings:setup-workspace` | renderer → main | Cria pastas + templates + reinicia FileWatcher |
| `settings:select-folder` | renderer → main | Abre dialog nativo de pasta |
| `people:list` | renderer → main | Lista todas as pessoas |
| `people:get` | renderer → main | Retorna uma pessoa por slug |
| `people:save` | renderer → main | Cria ou atualiza config.yaml |
| `people:delete` | renderer → main | Remove pessoa |
| `people:get-perfil` | renderer → main | Lê perfil.md com migration + injeta `acoes_pendentes_count` e `dados_stale` computados |
| `people:list-pautas` | renderer → main | Lista pautas de uma pessoa |
| `artifacts:list` | renderer → main | Lista artefatos de uma pessoa |
| `artifacts:feed` | renderer → main | Feed global de todos os artefatos |
| `artifacts:read` | renderer → main | Lê conteúdo de um artefato por path |
| `detected:list` | renderer → main | Lista pessoas detectadas não cadastradas |
| `detected:dismiss` | renderer → main | Descarta uma pessoa detectada |
| `ingestion:queue` | renderer → main | Retorna fila atual |
| `ingestion:enqueue` | renderer → main | Enfileira arquivo manualmente |
| `actions:list` | renderer → main | Lista ações de uma pessoa |
| `actions:update-status` | renderer → main | Atualiza status de uma ação |
| `ai:test` | renderer → main | Testa o Claude CLI |
| `ai:generate-agenda` | renderer → main | Gera pauta de 1:1 |
| `ai:cycle-report` | renderer → main | Relatório de ciclo/avaliação |
| `shell:open` | renderer → main | Abre arquivo no editor externo |
| `ingestion:started` | main → renderer | Arquivo entrou na fila |
| `ingestion:completed` | main → renderer | Ingestão concluída |
| `ingestion:failed` | main → renderer | Erro no processamento |

---

## ClaudeRunner — Especificação Técnica

```typescript
spawn(claudeBin, ['-p', prompt], {
  env: { ...process.env },
  timeout: timeoutMs,
})
```

**Fluxo:**
1. Acumula stdout em buffer
2. Ao `close`: se `code !== 0` → lança erro com stderr
3. Tenta `JSON.parse(stdout.trim())`
4. Se falhar: tenta extrair JSON de bloco de código via regex
5. Se ainda falhar: conta como erro para retry

**Parâmetros:**
- Timeout ingestão: 90s por pass (pass 1 + pass 2 = até 180s para pessoas com perfil)
- Timeout relatório de ciclo: 120s
- Max retries: 2 (backoff linear: `attempt * 2000ms`)

**Detecção do binário:**
- `SettingsManager.detectClaudeBin()` tenta `zsh -l -c "which claude"`, com fallback para `bash -l`
- Armazena **path absoluto** em `settings.json`

**FileReader:** trunca conteúdo a 50.000 caracteres.

---

## Prompts — Estrutura

### ingestion.prompt.ts — Two-pass

**Pass 1:** sem perfil → identifica `pessoa_principal`

**Pass 2:** se `pessoa_principal` é cadastrada e tem perfil → re-executa com `perfilMdRaw` para gerar `resumo_evolutivo` e `temas_atualizados` com histórico real.

**Schema retornado:**
`tipo`, `data_artefato`, `titulo`, `participantes_nomes`, `pessoas_identificadas`, `novas_pessoas_detectadas`, `pessoa_principal`, `resumo`, `acoes_comprometidas` (objeto: `{responsavel, descricao, prazo_iso}`), `pontos_de_atencao`, `pontos_resolvidos`, `elogios_e_conquistas`, `temas_detectados`, `resumo_evolutivo`, `temas_atualizados`, `indicador_saude`, `motivo_indicador`, `sentimento_detectado`, `nivel_engajamento`, `necessita_1on1`, `motivo_1on1`, `alerta_estagnacao`, `motivo_estagnacao`, `sinal_evolucao`, `evidencia_evolucao`

**Validação:** `SchemaValidator.ts` valida campos obrigatórios + tipos. Falha no pass 1 → erro. Falha no pass 2 → usa pass 1 com aviso.

### agenda.prompt.ts

Contexto: `config.yaml` + `perfil.md` + pautas anteriores + ações abertas.

Retorna JSON com: follow-ups, temas, perguntas sugeridas, alertas, reconhecimentos.

### agenda-gestor.prompt.ts

Contexto: igual ao agenda.prompt + `LideradoSnapshot[]` (roll-up do time).

Usa `dados_stale` para suprimir alertas de liderados sem ingestão recente (30+ dias).

### cycle.prompt.ts

Contexto: `config.yaml` + `perfil.md` + artefatos do período.

Retorna JSON com: `linha_do_tempo`, `entregas_e_conquistas`, `padroes_de_comportamento`, `evolucao_frente_ao_cargo`, `pontos_de_desenvolvimento`, `conclusao_para_calibracao`, `flag_promovibilidade`, **`evidencias_promovibilidade`** (3–5 bullets citáveis no fórum).

---

## Pipeline de Ingestão

```
FileWatcher detects file
  → IngestionPipeline.enqueue()
    → drainQueue() — até 3 paralelos
      → processItem()
        → Pass 1: buildIngestionPrompt(perfilMdRaw: null)
        → SchemaValidator.validate()
        → se pessoa registrada com perfil:
            Pass 2: buildIngestionPrompt(perfilMdRaw: perfil.raw)
            SchemaValidator.validate()
        → se pessoa registrada: acquirePersonLock() → syncItemToPerson()
          → ArtifactWriter.writeArtifact()
          → ArtifactWriter.updatePerfil()
          → ActionRegistry.createFromArtifact() [com prazo, owner, responsavel_slug]
        → se sem pessoa_principal: syncItemToCollective()
          → cria ações no ActionRegistry de cada responsável registrado
        → se pessoa não cadastrada: status = 'pending'
```

**Per-person lock:** `acquirePersonLock(slug)` serializa writes de `perfil.md` via promise chain, sem bloquear itens de pessoas diferentes.

---

## Templates de Artefato

Criados em `artefatos/{tipo}/template.md` no setup do workspace. Tipos: `1on1`, `reuniao`, `feedback`, `planning`, `retro`, `daily`.

**Regra:** nunca sobrescrevem arquivos existentes (preserva edições do usuário).

Formato padrão:
```markdown
---
tipo: 1on1
data: YYYY-MM-DD
participante: Nome do liderado
duracao_min: 30
---

## Check-in
## Follow-up de ações anteriores
## O que foi discutido
## Ações comprometidas
## Observações do gestor
```

---

## LideradoSnapshot — campos computados

Retornado por `PersonRegistry.getTeamRollup()`. Todos os campos são calculados em runtime:

| Campo | Fonte | Descrição |
|-------|-------|-----------|
| `acoes_pendentes_count` | ActionRegistry | Ações com `status === 'open'` |
| `acoes_vencidas_count` | ActionRegistry | Ações `open` com `prazo < hoje` |
| `precisa_1on1_frequencia` | Frontmatter + config | `diasSem1on1 > frequencia_1on1_dias + 3` |
| `dias_sem_1on1` | Frontmatter `ultimo_1on1` | Dias desde o último 1:1 |
| `dados_stale` | Frontmatter `ultima_ingestao` | Sem ingestão há 30+ dias |

---

## Riscos Técnicos

| Risco | Prob. | Mitigação |
|-------|-------|-----------|
| Claude retorna JSON inválido | Alta | `SchemaValidator` + mensagem de erro com campo problemático |
| Race condition em escritas paralelas | Média | `acquirePersonLock()` — promise chain por slug |
| Pass 2 aumenta custo por artefato | Média | Apenas para pessoas registradas com perfil existente |
| Migration silenciosa corrompendo dados | Baixa | `migrateProfileContent` é idempotente; persiste só se mudou |
| Timeout em artefatos longos | Média | Truncar input em 50k chars + timeouts configuráveis |
| chokidar eventos duplicados no macOS | Baixa | `awaitWriteFinish: { stabilityThreshold: 2000 }` + debounce 5s |

---

## Comandos

```bash
npm run dev    # desenvolvimento
npm run build  # build de produção
npm run lint   # lint TypeScript
```
