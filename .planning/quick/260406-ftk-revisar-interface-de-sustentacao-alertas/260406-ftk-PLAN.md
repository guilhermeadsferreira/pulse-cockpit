---
phase: quick
plan: 260406-ftk
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderer/src/views/SustentacaoView.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Alertas ativos fazem parte do fluxo de scroll normal da página"
    - "Não há área de altura fixa fora do scroll que empurre ou sobreponha conteúdo"
    - "O header de 'ALERTAS ATIVOS' não usa position sticky"
    - "O layout não quebra visualmente com qualquer quantidade de alertas"
  artifacts:
    - path: src/renderer/src/views/SustentacaoView.tsx
      provides: "SustentacaoView com alertas integrados ao scroll"
  key_links:
    - from: "AlertasBanner"
      to: "div scrollável (overflowY: auto)"
      via: "mover JSX para dentro do container de conteúdo"
---

<objective>
Corrigir o layout da SustentacaoView: os alertas ativos estão renderizados fora do container scrollável, criando um bloco de altura fixa (maxHeight: 35vh) entre o header e o conteúdo. Isso quebra o layout e isola os alertas do fluxo normal de leitura.

Purpose: Alertas ativos devem ser a primeira coisa visível no conteúdo ao entrar na view, integrados ao scroll como qualquer outra seção.
Output: SustentacaoView sem AlertasBanner fora do scroll, sem `position: sticky` no header interno dos alertas, sem `maxHeight` artificial.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Mover AlertasBanner para dentro do container scrollável e limpar estilos de posicionamento</name>
  <files>src/renderer/src/views/SustentacaoView.tsx</files>
  <action>
Três mudanças cirúrgicas no arquivo, nenhuma alteração de lógica:

**1. Remover AlertasBanner de fora do scroll (linha ~761-763):**
Apagar o bloco condicional que renderiza `AlertasBanner` entre o erro e o `div` de conteúdo:
```tsx
{/* REMOVER este bloco inteiro: */}
{snapshot.alertas && snapshot.alertas.length > 0 && (
  <AlertasBanner alertas={snapshot.alertas} />
)}
```

**2. Inserir AlertasBanner como primeira seção dentro do div scrollável (linha ~766):**
Dentro do `div` com `overflowY: 'auto'` e `padding: '28px 40px'`, antes de `Row 1: Compliance cards`, inserir:
```tsx
{/* Alertas proativos — integrado ao scroll */}
{snapshot.alertas && snapshot.alertas.length > 0 && (
  <AlertasBanner alertas={snapshot.alertas} />
)}
```

**3. Limpar estilos do componente AlertasBanner (linha ~362-384):**
No elemento raiz do componente, remover `maxHeight: '35vh'` e `overflowY: 'auto'`.
No elemento do header interno (label "X ALERTAS ATIVOS"), remover `position: 'sticky'`, `top: 0`, `background: 'var(--bg)'` e `zIndex: 1` — deixar como flex row simples com `marginBottom: 8` para espaçamento.
Adicionar `marginBottom: 16` no container raiz dos alertas para separar da próxima seção.

O padding do container raiz de AlertasBanner (`margin: '0 40px 16px'`) deve ser removido também, pois o pai já tem `padding: '28px 40px'` — trocar por `marginBottom: 20`.
  </action>
  <verify>
    Inspecionar visualmente: abrir a view Sustentação no app, confirmar que os alertas aparecem no início do scroll, o header da página (título + botões) permanece fixo no topo, e ao rolar a página os alertas somem junto com o conteúdo normalmente.
    Build sem erros TypeScript: `cd /Users/guilhermeaugusto/Documents/workspace-projects/pulse-cockpit && npm run typecheck 2>&1 | tail -20` (ou equivalente disponível no projeto).
  </verify>
  <done>
    - AlertasBanner renderizado dentro do container scrollável, como primeira seção de conteúdo
    - Nenhum elemento com `position: sticky` nos alertas
    - Nenhum `maxHeight` artificial nos alertas (scroll da página controla tudo)
    - Sem erros de TypeScript introduzidos
  </done>
</task>

</tasks>

<verification>
Checar manualmente no app com alertas ativos:
1. Alertas aparecem logo abaixo do header ao entrar na view
2. Ao rolar para baixo, alertas saem de cena junto com o conteúdo (não ficam presos)
3. Com muitos alertas, a página inteira faz scroll — não existe sub-scroll isolado nos alertas
4. Com zero alertas, nada muda no layout
</verification>

<success_criteria>
AlertasBanner integrado ao fluxo normal de scroll da SustentacaoView. Nenhum posicionamento especial (sticky/fixed/maxHeight) nos alertas. Layout visualmente correto com 0, 1 ou N alertas.
</success_criteria>

<output>
Após conclusão, criar `.planning/quick/260406-ftk-revisar-interface-de-sustentacao-alertas/260406-ftk-SUMMARY.md`
</output>
