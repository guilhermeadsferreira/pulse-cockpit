# Requirements: Pulse Cockpit V2.1

**Defined:** 2026-03-26
**Core Value:** O contexto acumulado ao longo do ciclo — insights de 1:1, sinais de cerimônias, tendência emocional — deve estar acessível para o gestor na hora que importa: na tela do perfil, na pauta do próximo 1:1 e no relatório de calibração.

## V2.1 Requirements

Os dados de inteligência já são produzidos pelo pipeline V2. O gap é de superfície: exibição na UI e consumo nos prompts restantes.

### UI — PersonView

- [ ] **UI-01**: Gestor vê seção "Insights de 1:1" no perfil de cada liderado, com insights do Pass de 1:1 listados em ordem cronológica reversa
- [ ] **UI-02**: Gestor vê seção "Sinais de Terceiros" no perfil, com sinais do Pass de Cerimônia e correlações confirmadas em 1:1
- [ ] **UI-03**: Gestor consegue copiar o "Resumo Executivo QR" de um artefato de 1:1 para o clipboard com um clique

### UI — SettingsView

- [ ] **SET-01**: Gestor consegue disparar reingestão em batch de todos os artefatos processados diretamente na tela de Settings, com modal de confirmação e barra de progresso em tempo real

### Prompts — Pauta e Autoavaliação

- [ ] **PMPT-01**: Pauta roll-up com o gestor exibe tendências emocionais do time, correlações entre liderados e riscos compostos (múltiplos sinais de risco na mesma pessoa)
- [ ] **PMPT-02**: Prompt de autoavaliação do gestor consome campos V2: insights de feedback_dado, tendência emocional dos liderados, accountability (ações do gestor com ciclos_sem_mencao elevado)

### Performance — Ingestão

- [x] **PERF-01**: Gestor consegue ativar o modelo híbrido (OpenRouter para Pass Cerimônia) via Settings e observar redução de latência de ingestão em relação ao baseline do Claude CLI. Critérios de aceitação: (1) campo openRouterApiKey e toggle useHybridModel aparecem na SettingsView e persistem em ~/.pulsecockpit/settings.json; (2) com híbrido ativo, Pass Cerimônia chama OpenRouter em vez de Claude CLI; (3) se OpenRouter falha, há fallback automático para Claude CLI com log de warning visível nos logs do main process.

## V3 Requirements (deferred)

### Entidade Projeto

- **PROJ-01**: Gestor cadastra projetos com config.yaml análogo ao de pessoas
- **PROJ-02**: Pipeline de ingestão identifica projetos mencionados em artefatos e cria/atualiza status.md por projeto
- **PROJ-03**: Ações comprometidas incluem campo projeto_slug (retrocompatível com V2)

### View Hoje / Esta Semana

- **TODAY-01**: View diária mostra reuniões registradas, pautas pendentes, follow-ups vencendo e alertas ativos
- **TODAY-02**: View de semana consolida o que aconteceu e o que está pendente

### Integrações MCP

- **MCP-01**: Adapter Slack escreve mensagens de canais configurados como .md em inbox/
- **MCP-02**: Adapter Jira importa daily report por pessoa, bloqueios, métricas de fluxo

### Inteligência Avançada

- **AI-01**: Insights cruzados do time — padrões que aparecem em múltiplas pessoas simultaneamente
- **AI-02**: Caso de promoção gerado por IA com base em perfil + projetos + artefatos + PDI

## Out of Scope

| Feature | Reason |
|---------|--------|
| API Anthropic / @anthropic-ai/sdk | Decisão arquitetural permanente: Claude Code CLI somente |
| Banco de dados relacional | Markdown+YAML é o storage escolhido; manter portabilidade e transparência |
| Sync com servidor remoto | App local-first; iCloud/Google Drive são o mecanismo de sync |
| Multi-tenant / multi-usuário | Um gestor por instalação — simplifica modelo de dados e segurança |
| Mobile / web app | Electron desktop somente por ora |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UI-01 | Phase 1 | Pending |
| UI-02 | Phase 1 | Pending |
| UI-03 | Phase 1 | Pending |
| SET-01 | Phase 2 | Pending |
| PMPT-01 | Phase 3 | Pending |
| PMPT-02 | Phase 3 | Pending |
| PERF-01 | Phase 999.3 | Complete |

**Coverage:**
- V2.1 requirements: 7 total
- Mapeados para fases: 7
- Não mapeados: 0 ✓

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-27 after adding PERF-01 (hybrid model performance)*
