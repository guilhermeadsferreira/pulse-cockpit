# Phase 4: Settings + Identity

## Contexto

O Pulse Cockpit precisa de credenciais de API (Jira, GitHub) configuradas
pelo gestor e mapeamento de identidade externa para cada liderado. Sem isso,
nenhum dado externo pode ser buscado.

Esta fase é puramente infraestrutura de configuração — não há integração
com APIs ainda (isso é Phase 5).

## Solução Proposta

Duas mudanças independentes:

1. **AppSettings + SettingsView** — campos de configuração de Jira e GitHub
2. **PersonConfig + PersonFormView** — identidade externa por pessoa

## Escopo

### Must-Have (MVP)

1. Estender `AppSettings` com campos Jira e GitHub
2. Adicionar seções na `SettingsView` com toggles de ativação
3. Estender `PersonConfig` com `jiraEmail` e `githubUsername`
4. Adicionar seção na `PersonFormView` para identidade externa

### Nice-to-Have (Futuro)

- Validação de token no save (test call)
- Auto-detectar board ID do Jira
- Auto-sugerir repos do GitHub por organização

## Arquitetura

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/main/registry/SettingsManager.ts` | Adicionar campos Jira e GitHub ao `AppSettings` |
| `src/renderer/src/types/ipc.ts` | Sincronizar interface `AppSettings` |
| `src/renderer/src/views/SettingsView.tsx` | Seções "Jira" e "GitHub" + "Relatórios" |
| `src/main/registry/PersonRegistry.ts` | Adicionar `jiraEmail?` e `githubUsername?` ao `PersonConfig` |
| `src/renderer/src/views/PersonFormView.tsx` | Seção "Identidade Externa" |

### Interface AppSettings (campos novos)

```typescript
export interface AppSettings {
  // ... campos existentes ...

  // Jira
  jiraBaseUrl?: string        // "https://empresa.atlassian.net"
  jiraEmail?: string          // email do gestor
  jiraApiToken?: string       // API token (plaintext, uso pessoal)
  jiraProjectKey?: string     // "PROJ"
  jiraBoardId?: number        // 42
  jiraEnabled?: boolean

  // GitHub
  githubToken?: string        // PAT fine-grained
  githubOrg?: string          // "empresa"
  githubRepos?: string[]      // ["repo-api", "repo-web"]
  githubEnabled?: boolean

  // Reports
  dailyReportEnabled?: boolean
  dailyReportTime?: string    // "09:00" default
  sprintReportEnabled?: boolean
}
```

### Interface PersonConfig (campos novos)

```typescript
export interface PersonConfig {
  // ... campos existentes ...
  jiraEmail?: string          // email no Jira (pode diferir do corporativo)
  githubUsername?: string     // username do GitHub
}
```

### SettingsView Layout

```
▼ Integração Jira
  [Base URL          ] https://empresa.atlassian.net
  [Email             ] gestor@empresa.com
  [API Token (senha) ] ••••••••••
  [Project Key       ] PROJ
  [Board ID          ] 42
  [✓] Ativar integração Jira

▼ Integração GitHub
  [Token (senha)     ] ••••••••••
  [Organização       ] empresa
  [Repositórios      ] repo-api, repo-web
  [✓] Ativar integração GitHub

▼ Relatórios Automáticos
  [✓] Gerar daily report ao abrir o app
  [✓] Gerar relatório de sprint (início/fim)
```

### PersonFormView Layout

```
▼ Identidade Externa
  [Email Jira        ] joao@empresa.com
  [Username GitHub   ] joaosilva
```

## Fluxo de Dados

```
SettingsView:
  - Carrega AppSettings via window.api.settings.load()
  - Renderiza seções Jira, GitHub, Relatórios
  - Salva via window.api.settings.save()

PersonFormView:
  - Carrega PersonConfig via PersonRegistry.get(slug)
  - Renderiza seção "Identidade Externa"
  - Salva config.yaml via PersonRegistry.save()

settings.json (disco):
  ~/.pulsecockpit/settings.json
  { ..., jiraBaseUrl, jiraEmail, jiraApiToken, ... }

config.yaml (disco):
  {workspace}/pessoas/{slug}/config.yaml
  { ..., jiraEmail, githubUsername }
```

## Tasks

1. Estender `AppSettings` com campos Jira, GitHub, Reports
2. Sincronizar `ipc.ts` com a interface atualizada
3. Adicionar seções na `SettingsView.tsx` (Jira, GitHub, Relatórios)
4. Estender `PersonConfig` com `jiraEmail?` e `githubUsername?`
5. Adicionar seção na `PersonFormView.tsx`

## Critérios de Sucesso

- [ ] SettingsView exibe seções "Jira", "GitHub" e "Relatórios" com campos corretos
- [ ] Campos de API são type=password
- [ ] Toggle de ativação desabilitado quando token ausente
- [ ] Campos salvam em ~/.pulsecockpit/settings.json corretamente
- [ ] PersonFormView exibe seção "Identidade Externa"
- [ ] config.yaml contém jiraEmail e githubUsername após preenchimento
- [ ] TypeScript compila sem erros

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Tokens em plaintext no settings.json | Mesmo padrão existente (OpenRouter, Google AI). Usuário ciente. |
| Alteração de AppSettings quebra algo existente | Campos novos são todos opcionais (?). Comportamento existente inalterado. |
| PersonFormView complexa demais | Seção é simples — 2 campos de texto. Padrão igual ao de configuração existente. |

## Estimativa

- **Duração:** ~1 hora
- **Complexidade:** Baixa (extensão de interfaces existentes + UI)

## Próxima Fase

Phase 5: External Clients — JiraClient e GitHubClient que consomem os tokens configurados aqui.
