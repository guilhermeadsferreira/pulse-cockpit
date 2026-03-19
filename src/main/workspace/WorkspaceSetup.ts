import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

const ARTIFACT_TYPES = ['1on1', 'reuniao', 'daily', 'planning', 'retro', 'feedback']

export async function setupWorkspace(workspacePath: string): Promise<void> {
  const dirs = [
    workspacePath,
    join(workspacePath, 'inbox'),
    join(workspacePath, 'inbox', 'processados'),
    join(workspacePath, 'pessoas'),
    join(workspacePath, 'pessoas', '_coletivo', 'historico'),
    join(workspacePath, 'exports'),
    ...ARTIFACT_TYPES.map((t) => join(workspacePath, 'artefatos', t)),
  ]

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  // Write artifact templates (only if they don't exist — preserves user edits)
  for (const [tipo, content] of Object.entries(TEMPLATES)) {
    const dest = join(workspacePath, 'artefatos', tipo, `template.md`)
    if (!existsSync(dest)) {
      writeFileSync(dest, content, 'utf-8')
    }
  }
}

// ─── Artifact Templates ────────────────────────────────────────
// Copied into artefatos/{tipo}/template.md on workspace setup.
// Users can edit freely — the app never overwrites existing files.

const TEMPLATES: Record<string, string> = {
  '1on1': `---
tipo: 1on1
data: YYYY-MM-DD
participante: Nome do liderado
duracao_min: 30
---

## Check-in
<!-- Como a pessoa está? Energia, humor, contexto pessoal relevante -->

## Follow-up de ações anteriores
<!-- Status de cada ação do último 1:1 -->
- [ ] [Ação]: status atual

## O que foi discutido

## Decisões tomadas

## Ações comprometidas
<!-- Formato: [Nome]: [o que fazer] até [YYYY-MM-DD] -->
- [ ] [Nome]: ...

## Observações do gestor
<!-- Engajamento observado, percepções, contexto não dito -->
`,

  reuniao: `---
tipo: reuniao
data: YYYY-MM-DD
titulo: Título descritivo (ex: Planning Q2 — Plataforma)
participantes:
  - Nome 1
  - Nome 2
duracao_min: 60
---

## Objetivo da reunião

## O que foi discutido

## Decisões tomadas
<!-- Enumere com responsável -->
1. [Decisão] — responsável: [Nome]

## Ações comprometidas
<!-- Formato: [Nome]: [o que fazer] até [YYYY-MM-DD] -->
- [ ] [Nome]: ...

## Observações sobre o time
<!-- Dinâmica, conflitos, destaques individuais -->
`,

  feedback: `---
tipo: feedback
data: YYYY-MM-DD
para: Nome de quem recebeu
de: gestor
contexto: situação específica (ex: "entrega do serviço de auth — sprint 42")
---

## Situação
<!-- O que aconteceu? Data, projeto, entrega específica -->

## Comportamento observado
<!-- Apenas fatos observáveis — sem julgamento -->

## Impacto
<!-- Efeito no time, produto ou organização -->

## Expectativa / O que fazer diferente

## Reação da pessoa
<!-- Reconheceu? Resistiu? Comprometeu-se com algo específico? -->
`,

  planning: `---
tipo: planning
data: YYYY-MM-DD
squad: nome do squad
sprint: número ou período
participantes:
  - Nome 1
  - Nome 2
---

## Resumo do que foi discutido

## Decisões relevantes

## Impedimentos identificados
<!-- Com responsável pela resolução -->
- [Impedimento] — responsável: [Nome]

## Ações comprometidas
- [ ] [Nome]: ... até [YYYY-MM-DD]

## Observações sobre o time
<!-- Energia, colaboração, destaques ou preocupações individuais -->
`,

  retro: `---
tipo: retro
data: YYYY-MM-DD
squad: nome do squad
sprint: número ou período
participantes:
  - Nome 1
  - Nome 2
---

## O que foi bem

## O que pode melhorar

## Ações de melhoria
- [ ] [Nome]: ... até [YYYY-MM-DD]

## Observações sobre o time
<!-- Dinâmica, conflitos, destaques individuais -->
`,

  daily: `---
tipo: daily
data: YYYY-MM-DD
squad: nome do squad
participantes:
  - Nome 1
  - Nome 2
---

## O que foi feito ontem

## O que será feito hoje

## Impedimentos
<!-- Com responsável pela resolução -->

## Observações
<!-- Destaques individuais, preocupações, dinâmica do time -->
`,
}
