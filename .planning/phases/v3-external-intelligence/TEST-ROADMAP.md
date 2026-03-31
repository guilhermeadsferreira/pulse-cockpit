# Roteiro de Testes — V3 External Intelligence
**Versão:** 2.0 | **Data:** 2026-03-31 | **Fase:** Phase 4 + Team Sync

---

## Pré-requisitos

### Credenciais Jira (obtenha em https://id.atlassian.com/manage-profile/security/api-tokens)
- [ ] URL do Jira (ex: `https://empresa.atlassian.net`)
- [ ] Email do Jira
- [ ] API Token
- [ ] Project Key (ex: `TEAM`)
- [ ] Board ID (número do quadro Scrum)

### Credencial GitHub
- [ ] Fine-grained PAT **ou** Classic PAT com permissões:
  - Pull requests → Read
  - Contents → Read
  - **Organization → Teams → Read** (se fine-grained; ou `repo` no classic)
- [ ] Nome da organização
- [ ] **Team Slug** do seu time (ex: `conta-digital`)
- [ ] Classic PAT com scope `repo` funcionando ✅ (já testado)

### Ambiente
- [ ] App compilando (`npm run build` passou)
- [ ] Workspace configurado
- [ ] Pelo menos 1 pessoa cadastrada no time

---

## Teste 1 — Settings: Seção Jira

**Objetivo:** Validar que a seção Jira aparece e salva corretamente

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | Abra **Settings** | Tela carrega | ☐ |
| 2 | Role até ver seção "Jira" | Seção visível com ícone ExternalLink | ☐ |
| 3 | Preencha URL, email, API token, project key, board ID | Campos aceitam texto | ☐ |
| 4 | Observe o toggle `jiraEnabled` | Habilitado após preencher email | ☐ |
| 5 | Clique **Salvar alterações** | Salva sem erro | ☐ |
| 6 | Feche e reabasteça Settings | Dados persistem nos campos | ☐ |
| 7 | Limpe o campo email | Toggle `jiraEnabled` fica **desabilitado** | ☐ |
| 8 | Mensagem hint indica "Configure os campos abaixo" | Hint correto aparece | ☐ |

**Critério de sucesso:** Seção Jira visível, campos salvam, toggle condicional funciona

---

## Teste 2 — Settings: Seção GitHub + Team Sync

**Objetivo:** Validar seção GitHub com Team Slug e sync de repos

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | Role até ver seção "GitHub" | Seção visível com ícone GitHub | ☐ |
| 2 | Preencha **PAT**, **Organização** | Campos aceitam texto | ☐ |
| 3 | Preencha **Team Slug**: `conta-digital` | Campo aceita texto | ☐ |
| 4 | Observe o botão **"Sincronizar"** | Habilitado (team + token preenchidos) | ☐ |
| 5 | Clique em **Sincronizar** | Loading gira, depois preenche textarea | ☐ |
| 6 | Textarea mostra repos separados por vírgula | `repo1, repo2, repo3...` | ☐ |
| 7 | Hint mostra "Sincronizado em [data]" | Timestamp aparece | ☐ |
| 8 | Observe o toggle `githubEnabled` | Habilitado após preencher token | ☐ |
| 9 | Salve | Salva sem erro | ☐ |
| 10 | Reabasteça Settings | Dados persistem, repos mantidos | ☐ |

**Critério de sucesso:** Team Sync funciona, repos separados por vírgula, persistência ok

---

## Teste 2b — Sync Manual Reseta Cache

**Objetivo:** Validar que clicar em "Sincronizar" reseta o cache de 7 dias

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | Aguarde alguns segundos | — | ☐ |
| 2 | Clique em **Sincronizar** novamente | Repos recarregam | ☐ |
| 3 | Hint mostra **horário atualizado** (não data antiga) | Cache foi resetado | ☐ |

**Critério de sucesso:** Sync manual reseta `githubReposCachedAt`

---

## Teste 2c — Auto-Sync no Startup

**Objetivo:** Validar que ao reabrir o app, sync ocorre automaticamente se cache expirado

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | **Feche** o app completamente | App encerrado | ☐ |
| 2 | **Abra** o app novamente | App inicia | ☐ |
| 3 | Abra **Settings** → GitHub | Hint mostra timestamp de **agora** | ☐ |
| 4 | Repos ainda estão preenchidos | Lista mantida | ☐ |

**Critério de sucesso:** Auto-sync rodou no startup sem clique manual

---

## Teste 2d — Team Slug Inválido

**Objetivo:** Validar tratamento de erro quando team não existe

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | Limpe o Team Slug e clique **Sincronizar** | Botão **desabilitado** (sem team) | ☐ |
| 2 | Digite team slug errado: `time-inexistente` | Botão **habilitado** | ☐ |
| 3 | Clique **Sincronizar** | Toast **vermelho** de erro aparece | ☐ |
| 4 | Mensagem: "Team não encontrado ou sem acesso" | Erro claro ao usuário | ☐ |

**Critério de sucesso:** Erro 404 tratado com toast amigável

---

## Teste 3 — PersonFormView: Identidade Externa

**Objetivo:** Validar seção de identidade externa na criação/edição de pessoa

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | Vá para **Time** → **Adicionar pessoa** | Form carrega | ☐ |
| 2 | Role até o final do form | Seção "Identidade Externa" visível | ☐ |
| 3 | Preencha `jiraEmail` | Campo aceita email | ☐ |
| 4 | Preencha `githubUsername` | Campo aceita string | ☐ |
| 5 | Complete os campos obrigatórios e **Salvar** | Pessoa salva com identidade | ☐ |
| 6 | Edite a pessoa salva | Identidade persiste | ☐ |
| 7 | Tente salvar SEM identidade externa | **Salva normalmente** (campos opcionais) | ☐ |

**Critério de sucesso:** Seção visível, campos opcionais, persistem após save

---

## Teste 4 — PersonView: ExternalDataCard com Refresh

**Objetivo:** Validar que o card de dados externos aparece e tem botão de refresh

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | Abra PersonView de pessoa **COM** identidade | ExternalDataCard aparece no sidebar | ☐ |
| 2 | Observe o header do card | "Dados Externos" + timestamp + botão refresh | ☐ |
| 3 | Clique no botão **refresh** (↻) | Ícone gira (loading) | ☐ |
| 4 | Aguarde ~10s | Card atualiza com novos dados | ☐ |
| 5 | Abra PersonView de pessoa **SEM** identidade | Card **não aparece** | ☐ |

**Critério de sucesso:** Card aparece conditionally, refresh funciona

---

## Teste 5 — Integração Jira (precisa credencial real)

**Objetivo:** Validar que dados do Jira aparecem no card

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | Configure credenciais Jira no Settings | Toggle habilitado | ☐ |
| 2 | Edite pessoa com `jiraEmail` = email real do Jira | Email salvo | ☐ |
| 3 | Clique refresh no ExternalDataCard | Dados carregam do Jira | ☐ |
| 4 | Verifique campos: |  |  |
|   | Sprint | Nome do sprint aparece | ☐ |
|   | Issues abertas | Número maior que 0 | ☐ |
|   | Workload | Badge alto/medio/baixo | ☐ |
|   | Blockers | Contador ou "0 ativo(s)" | ☐ |
|   | Bugs ativos | Número pode ser 0 | ☐ |

**Critério de sucesso:** Dados Jira visíveis e corretos

---

## Teste 6 — Integração GitHub (precisa credencial real)

**Objetivo:** Validar que dados do GitHub aparecem no card

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | Configure credenciais GitHub no Settings | Toggle habilitado | ☐ |
| 2 | Edite pessoa com `githubUsername` = username real | Username salvo | ☐ |
| 3 | Clique refresh no ExternalDataCard | Dados carregam do GitHub | ☐ |
| 4 | Verifique campos: |  |  |
|   | Commits (30d) | Número > 0 se há atividade | ☐ |
|   | PRs merged | Número noúltimo mês | ☐ |
|   | PRs abertos | Contagem atual | ☐ |
|   | Reviews | Número de reviews dados | ☐ |

**Critério de sucesso:** Dados GitHub visíveis e corretos

---

## Teste 7 — Insights Cruzados

**Objetivo:** Validar que CrossAnalyzer gera insights

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | Após ter dados Jira + GitHub no card | Seção "INSIGHTS CRUZADOS" aparece | ☐ |
| 2 | Verifique ícone de severidade | ⚠️ alta / 🔶 media / ℹ️ baixa | ☐ |
| 3 | Leia descrição do insight | Texto descritivo presente | ☐ |

**Critério de sucesso:** Insights aparecem com severidade e descrição

---

## Teste 8 — RelatóriosView

**Objetivo:** Validar browser de relatórios

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | Clique em **Relatórios** na sidebar | RelatoriosView carrega | ☐ |
| 2 | Se há relatórios: | Lista de relatórios aparece | ☐ |
|   | Daily reports | Agrupados com badge "HOJE" | ☐ |
|   | Sprint reports | Agrupados com badge "SPRINT" | ☐ |
| 3 | Clique em um relatório | Preview markdown expande | ☐ |
| 4 | Clique em **Atualizar Agora** | Reload executa | ☐ |
| 5 | Se NÃO há relatórios: | Estado vazio com mensagem amigável | ☐ |

**Critério de sucesso:** Lista + preview + refresh funcionais

---

## Teste 9 — Graceful Degradation

**Objetivo:** Validar que sistema não quebra com falhas parciais

| # | Passo | Esperado | ✓ |
|---|-------|----------|---|
| 1 | Jira desabilitado no Settings | Pipeline continua normalmente | ☐ |
| 2 | Credenciais Jira inválidas | ExternalDataPass pula, sem crash | ☐ |
| 3 | Pessoa SEM identidade externa | Pipeline continua, card não aparece | ☐ |
| 4 | Credenciais GitHub inválidas | Erro no log, pipeline continua | ☐ |
| 5 | Sem conectividade | Erro graceful, sem crash | ☐ |
| 6 | Team slug vazio + GitHub habilitado | Não tenta sync, usa repos vazio | ☐ |
| 7 | Repos vazio + Team slug configurado | Tenta auto-sync silencioso | ☐ |

**Critério de sucesso:** Nenhum crash, erros tratados silenciosamente

---

## Resumo de Checkpoints

| # | Teste | Sem credencial real? | Com credencial real? |
|---|-------|----------------------|---------------------|
| 1 | Seção Jira | ✅ | — |
| 2 | Seção GitHub + Team Sync | ✅ | — |
| 2b | Sync manual reseta cache | ✅ | — |
| 2c | Auto-sync no startup | ✅ | — |
| 2d | Erro team inválido | ✅ | — |
| 3 | Identidade Externa | ✅ | — |
| 4 | ExternalDataCard + refresh | ✅ | — |
| 5 | Jira Card (dados reais) | — | ✅ |
| 6 | GitHub Card (dados reais) | — | ✅ |
| 7 | Insights Cruzados | — | ✅ |
| 8 | RelatóriosView | ✅ | ✅ |
| 9 | Graceful degradation | ✅ | — |

**Ordem sugerida:** 1 → 2 → 2b → 2c → 2d → 3 → 4 → 8 → 9 → 5 → 6 → 7

---

## Permissões do Token GitHub

| Tipo de token | Permissões necessárias |
|---------------|----------------------|
| **Fine-grained PAT** | Pull requests (Read), Contents (Read), **Organization → Teams (Read)** |
| **Classic PAT** | `repo` (full) ou `read:org` + `read:teams` + `read:repo` |

### Como configurar Fine-grained PAT
1. **github.com/settings/tokens** → Generate new token
2. **Resource owner**: sua organização
3. **Repository access**: todos os repos (ou específicos)
4. **Repository permissions**: Pull requests → Read, Contents → Read
5. **Organization permissions**: Teams → Read

---

## Fluxo Completo — Team Sync

```
[App Start]
    │
    ▼
githubTeamSlug = "conta-digital" configurado?
    │
    ├─ NÃO → usa githubRepos explícitos (se houver)
    │
    └─ SIM → githubRepos tem itens E cache < 7 dias?
                │
                ├─ SIM → usa cache
                │
                └─ NÃO → GET /orgs/{org}/teams/conta-digital/repos
                            │
                            ▼
                         githubRepos = [repos...]
                         githubReposCachedAt = now
                            │
                            ▼
                         Pipeline usa githubRepos normalmente
```

```
[Settings UI — GitHub]
┌─────────────────────────────────────────────────────────┐
│ GitHub                                                   │
│                                                          │
│ Usar GitHub para métricas externas    [✓]                │
│                                                          │
│ Personal Access Token     [••••••••••••••]              │
│                                                          │
│ Organização              [minha-empresa]                 │
│                                                          │
│ Team Slug               [conta-digital]  [🔄 Sincronizar]│
│                            ↑                             │
│                            └─ Synced em 31/03 02:00     │
│                                                          │
│ Repositórios  [repo1, repo2, repo3, repo4]              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Problemas Conhecidos

- Erros LSP em `PersonFormView.tsx` (tipo `relacao`) — pré-existente, não afeta runtime
- Build passa cleanly, lint tem errors de config pré-existentes
