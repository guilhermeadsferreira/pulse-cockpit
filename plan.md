# Plano — Fase 3: Finalização (8 tasks restantes)

## Contexto

R4 da revisão extensiva está com T-R4.1–4.4 concluídas. Restam 8 tasks da Fase 3 do PLANO_FASEADO.md, todas focadas em UX/IPC sem risco de dados. Uma delas (T-R10.9) já está implementada e precisa apenas ser marcada. As outras 7 são mudanças de UI, prompts e IPC menores.

---

## T-R10.9 — Batch reingest na UI ✅ JÁ IMPLEMENTADO

`SettingsView.tsx` já tem: Preview → lista arquivos de processados → "Reingerir todos" com confirmação → chama `resetData()` + `batchReingest()`.

**Ação:** Apenas marcar como concluída em `tasks/done.md`.

---

## T-R10.8 — Sprint refresh: botão na UI

**Arquivo:** `src/renderer/src/views/RelatoriosView.tsx`

- `external:refresh-sprint` handler existe em `index.ts:701`
- `window.api.external.refreshSprint()` já exposto em `preload/index.ts:108`
- Sprint reports já listados na UI (seção `sprintReports`) — só falta o botão

**Mudança:** Adicionar botão "Gerar Sprint" no header de RelatoriosView, ao lado dos botões Daily/Weekly/Monthly existentes. Chamar `window.api.external.refreshSprint()` no `handleRefreshSprint` (mesmo padrão dos outros handlers).

---

## T-R10.7 — Campo `contexto` das ações visível na UI

**Arquivo:** `src/renderer/src/views/PersonView.tsx` — componente `ActionRow` (~linha 1133)

Atualmente a linha de detalhes secundários exibe: responsavel | prazo | fonteArtefato | criadoEm | concluidoEm.

`contexto` está no tipo `Action` e é passado para o prompt de agenda mas não exibido.

**Mudança:** Após a `<div>` com `{a.descricao ?? a.texto}`, adicionar linha de contexto:
```tsx
{(a as any).contexto && (
  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
    {(a as any).contexto}
  </div>
)}
```
Verificar se `contexto` já está tipado em `ipc.ts` — se não, adicioná-lo ao `interface Action`.

---

## T-R9.1 — Ação → artefato fonte: link clicável

**Arquivos:**
- `src/main/index.ts` — novo IPC handler
- `src/preload/index.ts` — expor novo handler
- `src/renderer/src/views/PersonView.tsx` — ActionRow
- `src/renderer/src/types/ipc.ts` — se necessário

**Contexto:** `fonteArtefato` já existe em `Action` (ex: `2026-03-15-slug.md`) e é exibido como texto plano. O renderer não tem acesso ao `workspacePath`, então a abertura do arquivo deve ser delegada ao main process.

**Mudanças:**
1. **`src/main/index.ts`:** Novo handler:
   ```typescript
   ipcMain.handle('artifacts:open', (_event, slug: string, fileName: string) => {
     const { workspacePath } = SettingsManager.load()
     const filePath = join(workspacePath, 'pessoas', slug, 'historico', fileName)
     if (existsSync(filePath)) shell.openPath(filePath)
   })
   ```
2. **`src/preload/index.ts`:** Em `artifacts:`, adicionar:
   ```typescript
   open: (slug: string, fileName: string) => ipcRenderer.invoke('artifacts:open', slug, fileName)
   ```
3. **`src/renderer/src/types/ipc.ts`:** Verificar se `open` está na interface `api.artifacts` — adicionar se necessário.
4. **`src/renderer/src/views/PersonView.tsx` — `ActionRow`:** Transformar `fonteArtefato` em botão clicável:
   ```tsx
   {a.fonteArtefato && (
     <button onClick={() => window.api.artifacts.open(slug, a.fonteArtefato!)} style={linkBtnStyle}>
       {a.fonteArtefato}
     </button>
   )}
   ```
   O `slug` já está disponível no escopo de `AcoesTab` — passar como prop para `ActionRow` ou fechar sobre ele.

---

## T-R10.6 — Cycle report com defaults inteligentes

**Arquivo:** `src/renderer/src/views/CycleReportView.tsx` (componente `CycleTab`)

Atualmente: `dateFrom` inicia com `d.setMonth(d.getMonth() - 3)` (hardcoded).

**Mudança:** Adicionar shortcuts de preset abaixo dos inputs de data (antes do botão Gerar):
```tsx
<div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
  {[
    { label: 'Últimos 90 dias', fn: () => { /* today - 90d */ } },
    { label: 'Último trimestre', fn: () => { /* Q anterior */ } },
    { label: 'Últimos 6 meses', fn: () => { /* today - 6m */ } },
  ].map(({ label, fn }) => (
    <button key={label} onClick={fn} style={presetBtnStyle}>{label}</button>
  ))}
</div>
```
- "Últimos 90 dias": `today - 90 dias` até `today` (comportamento atual como preset explícito)
- "Último trimestre": calcular trimestre anterior completo (Q anterior ao atual)
- "Últimos 6 meses": `today - 180 dias`

O `dateFrom` inicial permanece como `today - 90d` (sem mudança de comportamento padrão).

---

## T-R10.3 — Stale data: alert bar agregado no dashboard

**Arquivo:** `src/renderer/src/views/DashboardView.tsx`

`dados_stale` já é computado por `people:get-perfil` (flag boolean no frontmatter). Já usado no `TeamRiskPanel` individualmente. Falta o count agregado.

**Mudança:** No início do bloco `{/* Content */}`, antes do `{loading ? ...}`, adicionar derivação + banner:
```tsx
const staleCount = people.filter(p => perfis[p.slug]?.dados_stale).length
```
Banner (apenas quando `staleCount > 0` e `relacao === 'liderado'`):
```tsx
{staleCount > 0 && (
  <div style={{ background: 'rgba(100,120,160,0.08)', border: '1px solid rgba(100,120,160,0.2)', borderRadius: 6, padding: '8px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
    <AlertCircle size={13} />
    {staleCount} {staleCount === 1 ? 'pessoa sem' : 'pessoas sem'} dados há 30+ dias
  </div>
)}
```
Posição: dentro do `<>` após loading guard, antes do `TeamRiskPanel`.

---

## T-R10.1 — Dashboard: urgências do dia

**Arquivo:** `src/renderer/src/views/DashboardView.tsx`

**Novo componente `UrgenciasHoje`** (inline, após TeamRiskPanel):
- Todos os dados já disponíveis: `people`, `perfis`, `actionsMap`
- Exibe apenas se houver urgências (evita ruído)
- Apenas para `relacao === 'liderado'`

**Lógica de urgências (calculada no componente):**

```typescript
const today = new Date().toISOString().slice(0, 10)
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

type Urgencia = { slug: string; nome: string; tipo: '1on1' | 'acao' | 'alerta'; label: string }

const urgencias: Urgencia[] = []

for (const p of people) {
  const fm = perfis[p.slug] ?? {}
  const actions = actionsMap[p.slug] ?? []

  // 1:1 urgente (AI-flagged)
  if (fm.necessita_1on1 && !fm.dados_stale) {
    urgencias.push({ slug: p.slug, nome: p.nome, tipo: '1on1', label: fm.motivo_1on1 ?? '1:1 urgente' })
  }

  // Ações vencendo hoje ou amanhã
  const acoesPrazo = actions.filter(a => a.status === 'open' && a.prazo && a.prazo <= tomorrow)
  for (const a of acoesPrazo) {
    urgencias.push({ slug: p.slug, nome: p.nome, tipo: 'acao', label: `prazo: ${a.descricao ?? a.texto}`.slice(0, 60) })
  }

  // Saúde vermelho recente (não stale)
  if (fm.saude === 'vermelho' && !fm.dados_stale) {
    urgencias.push({ slug: p.slug, nome: p.nome, tipo: 'alerta', label: fm.motivo_indicador ?? 'saúde crítica' })
  }
}
```

**Layout:** Compacto, acima do TeamRiskPanel. Seção com label "Hoje" + lista de chips clicáveis (navigate para person). Máximo 5 itens visíveis (+ N ocultos).

---

## T-R7.2 — Demandas do gestor na pauta de 1:1

**Arquivos:**
- `src/main/prompts/agenda.prompt.ts`
- `src/main/index.ts` — handler `ai:generate-agenda`

**Contexto:** `DemandaRegistry.list().filter(d => d.pessoaSlug === slug && d.status === 'open')` retorna demandas do gestor vinculadas ao liderado. Tipo `Demanda` tem: `descricao`, `descricaoLonga`, `prazo`, `origem`.

**Mudanças:**

1. **`agenda.prompt.ts`** — adicionar a `AgendaPromptParams`:
   ```typescript
   demandasGestor?: string   // demandas do gestor vinculadas a esta pessoa
   ```
   No `buildAgendaPrompt`, adicionar seção:
   ```typescript
   const demandasSection = params.demandasGestor
     ? `\n## Demandas do gestor para esta 1:1\n${params.demandasGestor}\n`
     : ''
   ```
   Incluir em `${...}${demandasSection}${insightsSection}...` (antes de insights).

2. **`src/main/index.ts`** — no handler `ai:generate-agenda` (linha ~376), após carregar `enrichedActions`, adicionar:
   ```typescript
   const demandasRaw = new DemandaRegistry(settings.workspacePath)
     .list()
     .filter((d) => d.pessoaSlug === slug && d.status === 'open')
   const demandasGestor = demandasRaw.length > 0
     ? demandasRaw.map((d) => `- ${d.descricao}${d.prazo ? ` (prazo: ${d.prazo})` : ''}${d.descricaoLonga ? ` — ${d.descricaoLonga}` : ''}`).join('\n')
     : undefined
   ```
   Passar `demandasGestor` para `buildAgendaPrompt({ ..., demandasGestor })`.

   Verificar import: `DemandaRegistry` já deve estar importado — se não, adicionar.

---

## Arquivos críticos

| Arquivo | Tasks |
|---------|-------|
| `src/renderer/src/views/RelatoriosView.tsx` | T-R10.8 |
| `src/renderer/src/views/PersonView.tsx` | T-R10.7, T-R9.1 |
| `src/renderer/src/views/CycleReportView.tsx` | T-R10.6 |
| `src/renderer/src/views/DashboardView.tsx` | T-R10.3, T-R10.1 |
| `src/renderer/src/types/ipc.ts` | T-R9.1 (se contexto/open não tipados) |
| `src/main/index.ts` | T-R9.1 (artifacts:open), T-R7.2 |
| `src/preload/index.ts` | T-R9.1 (artifacts.open) |
| `src/main/prompts/agenda.prompt.ts` | T-R7.2 |
| `tasks/done.md` | T-R10.9 (marcar) |

---

## Ordem de execução

1. **T-R10.9** — Marcar como done (sem código)
2. **T-R10.8** — Sprint button no RelatoriosView (isolado, 1 arquivo)
3. **T-R10.7** — Contexto em ActionRow (1 arquivo)
4. **T-R9.1** — fonteArtefato clicável (IPC + preload + UI)
5. **T-R10.6** — Preset buttons no CycleTab (1 arquivo)
6. **T-R10.3** — Alert bar stale no Dashboard (1 arquivo)
7. **T-R10.1** — UrgenciasHoje no Dashboard (1 arquivo, mais complexo)
8. **T-R7.2** — Demandas na pauta (prompt + handler)

---

## Verificação

- `npx tsc --noEmit` limpo após cada task
- **T-R10.8:** Clicar "Gerar Sprint" → spinner + novo sprint_*.md aparece na lista
- **T-R10.7:** Abrir AcoesTab de pessoa com ação que tem `contexto` → ver texto secundário
- **T-R9.1:** Clicar no link do artefato fonte → arquivo .md abre no editor do sistema
- **T-R10.6:** Clicar preset "Último trimestre" → datas atualizam para Q anterior
- **T-R10.3:** Dashboard com pessoa sem ingestão há 30+ dias → banner amarelo no topo
- **T-R10.1:** Dashboard com pessoa `necessita_1on1=true` → seção "Hoje" aparece com chip clicável
- **T-R7.2:** Criar demanda vinculada a pessoa → gerar pauta → seção "Demandas do gestor" aparece no resultado
