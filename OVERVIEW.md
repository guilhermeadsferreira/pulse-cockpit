# Pulse Cockpit — Documento de Visão e Arquitetura

> Documento de referência para revisões de produto e técnica com apoio de IA.
> Cobre: ideia, problema, objetivos, módulos, regras de negócio, retroalimentações e roadmap.
>
> **Última atualização:** 2026-03-24

---

## 1. A ideia central

O Pulse Cockpit é um **app desktop para gestores de tecnologia** que transforma tudo que acontece no dia a dia de gestão — 1:1s, dailies, plannings, retros, feedbacks — num sistema vivo de inteligência sobre pessoas.

O gestor arrasta uma transcrição ou anotação para uma caixa de entrada. A IA analisa, extrai o que importa e acumula progressivamente num **Perfil Vivo** de cada pessoa do time. Com o tempo, esse perfil vira o lastro de contexto que alimenta pautas de 1:1, alertas proativos e relatórios de ciclo de avaliação.

**Princípio central:** cada ingestão retroalimenta o sistema. Quanto mais o gestor usa, mais preciso e útil o produto fica.

**Princípio técnico:** dados locais, sem servidor, sem API key adicional. Usa o Claude Code CLI que o gestor já tem instalado e autenticado.

---

## 2. O problema

Gestores de tecnologia vivem num estado de **sobrecarga de contexto distribuído**:

- 1:1s, dailies, plannings, retros acontecem toda semana
- As informações ficam espalhadas em Notion, Google Drive, e-mail, memória, anotações soltas
- Cada cerimônia existe de forma isolada — sem acumular inteligência sobre a pessoa
- Quando chega o ciclo de avaliação, o gestor começa do zero: sem linha do tempo, sem evidências de crescimento, sem histórico consolidado
- Fóruns de calibração exigem narrativa com evidências concretas — e o gestor não tem esse material estruturado

O workaround atual é usar IA pontual (Gemini, ChatGPT) para compilar uma síntese na véspera do fórum. O problema: sem contexto acumulado ao longo do ciclo, o que sai é uma síntese rasa, sem timeline de entregas, sem lastro de evolução, sem evidências que resistem ao escrutínio do fórum.

**O gap não é de ferramenta. É de acumulação.** O gestor já transcreve. A IA já existe. O que falta é um sistema que conecte os dois no tempo.

---

## 3. Para quem é

| Perfil | Dor principal |
|--------|---------------|
| Gerente de engenharia (3–15 reports diretos) | Perda de contexto entre 1:1s, dificuldade de preparar PDIs e defesas no fórum |
| Coordenador tech (5–10 reports) | Sem histórico consolidado para avaliações, pautas genéricas |
| Tech Lead com reports diretos | Falta de visão longitudinal da evolução de cada pessoa |

Requisito cultural: já usa ou está disposto a usar transcrição automática de reuniões (Gemini Meet, Otter, Fireflies). O Pulse Cockpit entra como **próximo passo natural** desse fluxo — o gestor já exporta transcrições; agora em vez de deixá-las no Drive, joga no app.

---

## 4. Objetivos de produto (Jobs to be Done)

**Job principal:**
> Quando estou num fórum de calibração defendendo um liderado, quero ter uma narrativa clara com evidências da sua evolução no ciclo — para conseguir defender com confiança se ela merece promoção, ficou acima/abaixo das expectativas, e qual foi seu papel nos desafios do time.

**Jobs secundários:**
- Quando vou fazer um 1:1, quero uma pauta gerada com base no histórico real da pessoa — para não depender de memória e não perder temas importantes
- Quero ser alertado proativamente sobre liderados sem contato recente — para não chegar à avaliação com lacunas no histórico
- Quando um liderado compromete uma ação numa reunião, quero rastreá-la sem esforço manual — para cobrar de forma específica e construir confiança

**Critérios de sucesso — V1:**

| Métrica | Meta |
|---------|------|
| Tempo para gerar relatório de ciclo pronto para calibração | < 2 minutos |
| Esforço de preparação para fórum de calibração | De 2h+ → < 20min |
| Gestor ingere ≥ 1 artefato/semana após 30 dias de uso | ≥ 60% dos usuários piloto |
| NPS após primeira rodada de avaliações | ≥ 8 |

---

## 5. Módulos do produto

### 5.1 People Registry — Quem é o time

O cadastro é o ponto de partida. Sem pessoas registradas, a IA não sabe a quem associar os artefatos.

**O que é cadastrado por pessoa:**
- Nome, slug (identificador único), cargo, nível (`junior → principal → manager`)
- Tipo de relação: `liderado | par | gestor | stakeholder`
- Squad, área, data de início no cargo e na empresa
- Frequência de 1:1 configurada (ex: a cada 14 dias)
- PDI: lista de objetivos com status e prazo
- Flag de processo de promoção em andamento
- Notas manuais (contexto que o gestor quer preservar mas não veio de transcrição)
- Alerta ativo manual

**Relações suportadas:**
O app não é só para gerenciar liderados. O gestor pode cadastrar pares, seu próprio gestor (para geração de pauta de reunião com o chefe) e stakeholders de outras áreas.

**Pessoa detectada (não cadastrada):**
Quando a IA identifica em um artefato alguém que participou diretamente de um evento mas não está cadastrado, cria uma entrada em `DetectedRegistry` — um registro intermediário que aparece na UI para que o gestor decida se cadastra ou descarta.

---

### 5.2 Inbox + Pipeline de Ingestão — Como o conhecimento entra

A Inbox é a porta de entrada de todo artefato. O gestor arrasta qualquer arquivo para ela.

**Formatos suportados:** `.md`, `.txt`, `.pdf`

**Tipos de artefato reconhecidos:**
`1on1 | reuniao | daily | planning | retro | feedback | outro`

**Como funciona o pipeline (técnico):**

```
FileWatcher monitora inbox/ com chokidar
  → IngestionPipeline.enqueue()
    → drainQueue() — até 3 itens processados em paralelo
      → processItem()
        → FileReader lê o arquivo (trunca em 50.000 chars)
        → Pass 1: Claude analisa sem contexto de perfil
          → SchemaValidator valida o JSON retornado
        → Se pessoa_principal cadastrada com perfil existente E artefato > 300 chars E ≥ 2 artefatos no perfil:
            Pass 2: Claude re-analisa com o perfil atual incluído no prompt
            → SchemaValidator valida
        → Se pessoa registrada → syncItemToPerson() [com per-person lock]
            → ArtifactWriter.writeArtifact() → historico/{slug}.md
            → ArtifactWriter.updatePerfil() → atualiza perfil.md
            → ActionRegistry.createFromArtifact() → actions.yaml
        → Se sem pessoa_principal → syncItemToCollective() → _coletivo/
            → Ações roteadas ao ActionRegistry de cada responsável registrado
            → [fire-and-forget] Para cada participante cadastrado:
                Pass Cerimônia (novo, 60s): buildCerimoniaSinalPrompt() focado nessa pessoa
                  → SchemaValidator valida CerimoniaSinalResult
                  → ArtifactWriter.updatePerfilDeCerimonia() → atualiza perfil sem criar entrada no histórico
        → Se pessoa detectada mas não cadastrada → status = 'pending'
          → fica esperando o gestor cadastrar a pessoa
          → ao cadastrar, syncPending() processa sem nova chamada ao Claude
```

**Por que dois passes (two-pass)?**
O Pass 1 identifica a pessoa principal sem contexto de histórico. O Pass 2 envia o perfil vivo acumulado junto com o artefato — permitindo que o Claude gere um `resumo_evolutivo` que integra o que aconteceu hoje com o que já se sabe da pessoa. Sem o Pass 2, o resumo evolutivo seria sempre baseado só no artefato atual.

**O que a IA extrai de cada artefato (Pass 1 / Pass 2):**

| Campo | Descrição |
|-------|-----------|
| `tipo` | Classificação do evento |
| `titulo` | Título descritivo (máx 80 chars) |
| `pessoas_identificadas` | Quem estava presente (slugs do time) |
| `pessoa_principal` | Sobre quem este artefato é mais relevante |
| `novas_pessoas_detectadas` | Participantes não cadastrados |
| `resumo` | 3–5 frases do que aconteceu |
| `acoes_comprometidas` | Lista com responsável, descrição e prazo |
| `pontos_de_atencao` | Riscos e preocupações identificados |
| `pontos_resolvidos` | Pontos de atenção anteriores superados |
| `elogios_e_conquistas` | Reconhecimentos detectados |
| `temas_detectados` | Temas recorrentes identificados |
| `resumo_evolutivo` | Narrativa integrando histórico + novo artefato (tom calibrado por `relacao`) |
| `temas_atualizados` | Lista completa dedupada de temas (histórico + novos) |
| `indicador_saude` | `verde / amarelo / vermelho` |
| `motivo_indicador` | 1 frase explicando o indicador |
| `sentimento_detectado` | `positivo / neutro / ansioso / frustrado / desengajado` |
| `nivel_engajamento` | Inteiro 1–5 |
| `necessita_1on1` | Boolean — há urgência de fazer um 1:1? |
| `motivo_1on1` | Por que o 1:1 é urgente |
| `alerta_estagnacao` | Boolean — sinais de estagnação no histórico |
| `motivo_estagnacao` | Padrão que gerou o alerta |
| `sinal_evolucao` | Boolean — evidência clara de crescimento |
| `evidencia_evolucao` | Descrição da evidência de crescimento |
| `confianca` | `alta / media / baixa` — nível de confiança nas inferências |

**O que o Pass de Cerimônia extrai por pessoa (reuniões coletivas):**

| Campo | Descrição |
|-------|-----------|
| `soft_skills_observadas` | Padrões comportamentais observáveis (comunicação, colaboração, autonomia) |
| `hard_skills_observadas` | Evidências técnicas concretas (liderou decisão, identificou bug, estimou corretamente) |
| `pontos_de_desenvolvimento` | Áreas que precisam crescer, observadas nesta cerimônia |
| `feedbacks_positivos` | Reconhecimentos positivos concretos |
| `feedbacks_negativos` | Observações negativas que merecem atenção |
| `temas_detectados` | Temas para merge nos Temas Recorrentes do perfil |
| `sentimento_detectado` | Estado emocional observado na cerimônia |
| `nivel_engajamento` | Participação 1–5 nesta cerimônia |
| `indicador_saude` | Sinal de saúde baseado apenas nesta cerimônia |
| `sinal_evolucao` | Evidência de crescimento observada |
| `necessita_1on1` | Urgência (apenas para sinais graves e inequívocos) |
| `confianca` | `alta / media / baixa` — proporcional à participação na cerimônia |

**Reunião coletiva:**
Quando um artefato não tem uma pessoa principal clara (ex: pós-warroom com 6 pessoas de times diferentes), é armazenado em `_coletivo/historico/`. As ações comprometidas são roteadas automaticamente para o `ActionRegistry` de cada responsável registrado. Em seguida, para cada participante cadastrado, roda um **Pass de Cerimônia** individual (prompt `cerimonia-sinal.prompt.ts`) que extrai sinais específicos dessa pessoa na reunião — soft skills observadas, hard skills, pontos de desenvolvimento, feedbacks positivos e negativos — e atualiza o perfil vivo da pessoa sem criar uma nova entrada no Histórico de Artefatos.

**Item pendente:**
Se a pessoa principal foi identificada pela IA mas não está cadastrada, o item fica em `pending`. O resultado da IA é **cacheado em memória** — ao cadastrar a pessoa, `syncPending()` processa sem invocar o Claude novamente.

---

### 5.3 Perfil Vivo — O coração do produto

O Perfil Vivo (`perfil.md`) é o arquivo que diferencia o Pulse Cockpit de qualquer ferramenta de notas. Ele cresce a cada ingestão e acumula inteligência sobre a pessoa.

**Estrutura do Perfil Vivo:**

```markdown
---
[frontmatter YAML com indicadores e datas]
---

## Resumo Evolutivo
Narrativa que é *reescrita* a cada ingestão direta (1:1, feedback, reunião com pessoa_principal).
Tom calibrado pela relação: desenvolvimento (liderado), alinhamento (gestor), colaboração (par).
NÃO é reescrita por sinais de cerimônia coletiva.

## Ações Pendentes
Lista de ações comprometidas. Novos itens são *appendados*. Gestor marca como concluído.

## Pontos de Atenção Ativos
Riscos e preocupações. Novos itens appendados — tanto de ingestões diretas quanto de sinais
de cerimônia (com prefixo do tipo, ex: `**2026-03-21 (daily):**`).
Quando a IA detecta que foram superados, aparecem com strikethrough automático.

## Conquistas e Elogios
Reconhecimentos e hard skills positivas acumulados. Recebe tanto itens de ingestões diretas
quanto de sinais de cerimônia coletiva.

## Temas Recorrentes
Lista dedupada dos temas que aparecem repetidamente nos artefatos. *Substituída integralmente*
a cada ingestão com a lista atualizada. Soft skills observadas em cerimônias também são
mergeadas aqui.

## Histórico de Artefatos
Links para cada artefato processado de ingestão direta. *Nunca reescrito* — apenas append.
Sinais de cerimônia coletiva NÃO criam entradas aqui (o artefato coletivo existe em _coletivo/).

## Histórico de Saúde
Série histórica de indicadores: `YYYY-MM-DD | verde | motivo`. Ingestões diretas e sinais de
cerimônia appendam entradas (as de cerimônia têm o tipo entre parênteses: `(daily)`, `(retro)`).
```

**Frontmatter — indicadores persistidos:**

```yaml
slug: "maria-silva"
schema_version: 3
ultima_atualizacao: "2026-03-21T10:00:00Z"
ultima_ingestao: "2026-03-21"
total_artefatos: 12
ultimo_1on1: "2026-03-15"
saude: "verde"
necessita_1on1: false
motivo_1on1: null
alerta_estagnacao: false
motivo_estagnacao: null
sinal_evolucao: true
evidencia_evolucao: "Liderou refatoração do serviço de auth sozinha"
```

**Regra do `ultimo_1on1`:** atualizado quando `tipo === '1on1'` OU quando `necessita_1on1 === false` num artefato bilateral. Isso cobre 1:1s informais que acontecem dentro de reuniões sem registro explícito como 1:1.

**Migração automática:** o Perfil Vivo tem schema versionado. Ao ler o arquivo, `ProfileMigration.ts` aplica migrações necessárias transparentemente e persiste a versão atualizada.

---

### 5.4 Action Loop — Rastreamento de Ações

Toda ação comprometida num artefato vira uma entrada estruturada em `actions.yaml` da pessoa responsável. Isso elimina a gestão manual de "o que foi prometido em qual reunião".

**Estrutura de uma ação:**

```yaml
- id: "2026-03-15-maria-silva-0"
  texto: "Apresentar proposta de observabilidade até 2026-03-22"
  responsavel: "Maria Silva"
  responsavel_slug: "maria-silva"
  prazo: "2026-03-22"
  owner: "liderado"          # gestor | liderado | terceiro
  prioridade: "media"        # baixa | media | alta
  status: "open"             # open | in_progress | done | cancelled
  criadoEm: "2026-03-15"
  concluidoEm: null
  fonteArtefato: "2026-03-15-maria-silva.md"
```

**Campo `owner`:** diferencia se a ação é responsabilidade do liderado, do próprio gestor ou de terceiros. Importante para saber o que cobrar de quem.

**Campo `descricao`:** armazena a descrição limpa da tarefa, separada do campo `texto` (que mantém o formato legado `"Responsável: descrição"`). A UI exibe `descricao` como título principal e `responsavel` como metadata — evitando o prefixo "Gestor:" no título.

**Nome do gestor nas ações:** quando configurado em settings (`managerName`), o prompt usa o nome real do gestor no campo `responsavel` das ações que ele comprometeu. Se não configurado, usa "Gestor" como fallback.

**Ações vencidas:** calculadas em runtime — `status === 'open' && prazo < hoje`. Não persistidas no disco, apenas computadas na leitura.

**Superfície nas pautas:** quando uma pauta de 1:1 é gerada, as ações abertas da pessoa (especialmente as vencidas) são incluídas no contexto do prompt — o Claude gera follow-ups específicos.

---

### 5.5 Pauta de 1:1 — Contexto acumulado em pauta acionável

Com base no Perfil Vivo e nas ações abertas da pessoa, o app gera uma pauta estruturada que parece ter sido escrita por alguém que conhece a pessoa de verdade.

**Contexto enviado ao Claude para gerar a pauta:**
- `config.yaml` da pessoa (cargo, PDI, nível, início)
- `perfil.md` completo (indicadores, histórico, temas, ações, pontos de atenção)
- Ações abertas do `ActionRegistry`
- Pautas anteriores (últimas 3)

**O que a pauta contém:**
- Follow-ups de ações comprometidas em reuniões anteriores
- Temas a aprofundar baseados nos padrões recorrentes do perfil
- Perguntas sugeridas ligadas ao contexto específico da pessoa
- Alertas de atenção (pontos ativos, sinal de estagnação)
- Reconhecimentos a fazer com base em conquistas recentes

**Variante — Pauta com o gestor:**
Quando a pessoa na pauta é o próprio gestor do usuário, o contexto inclui o `LideradoSnapshot[]` de todo o time. A pauta resulta num roll-up: saúde dos liderados diretos do usuário, o que escalar, conquistas do time, o que o gestor precisa saber.

---

### 5.6 Dashboard e Painel de Riscos — Visibilidade do time

O Dashboard é a visão de entrada do app. Mostra todos os membros do time (filtrável por tipo de relação) como cards com indicadores de saúde.

**Painel de Riscos (TeamRiskPanel):**
Acima dos cards, um painel consolidado mostra quem precisa de atenção agora, ordenado por número de sinais de risco.

**Gatilhos do painel de risco:**

| Gatilho | Fonte |
|---------|-------|
| Saúde `vermelho` | `perfil.md` frontmatter `saude` |
| Necessita 1:1 urgente (por conteúdo) | `perfil.md` frontmatter `necessita_1on1` |
| 1:1 atrasado por frequência | `ultimo_1on1` vs `frequencia_1on1_dias` do `config.yaml` |
| Ações vencidas | `ActionRegistry` — open com prazo < hoje |
| Alerta de estagnação | `perfil.md` frontmatter `alerta_estagnacao` |
| Dados desatualizados (stale) | `ultima_ingestao` há 30+ dias |

**Importante:** todos esses indicadores são calculados em runtime — nenhum contador derivado é persistido no disco. O disco guarda apenas os eventos brutos (data do último 1:1, data da última ingestão, indicador de saúde do último artefato). A inteligência é computada na leitura.

---

### 5.7 Relatório de Ciclo — O norte estrela do produto

É a feature mais estratégica. Para o gestor, este é o momento que valida todo o investimento de ingestão ao longo do ciclo.

**Como funciona:**
O gestor seleciona uma pessoa e um período (ex: Q1 2026). O app lê todos os artefatos do período, o perfil vivo atual e o `config.yaml`, envia tudo ao Claude e gera uma síntese estruturada pronta para o fórum de calibração.

**Estrutura do relatório:**
- **Linha do tempo:** eventos e entregas em ordem cronológica
- **Entregas e conquistas:** o que foi entregue, com evidências do histórico
- **Padrões de comportamento:** padrões observados consistentemente nos artefatos
- **Evolução frente ao cargo:** como a pessoa evoluiu em relação ao nível esperado do cargo
- **Pontos de desenvolvimento:** o que ainda precisa crescer
- **Conclusão para calibração:** parágrafo síntese pronto para usar no fórum
- **Flag de promovibilidade:** `pronto | em_desenvolvimento | nao`
- **Evidências de promovibilidade:** 3–5 bullets concretos e citáveis no fórum — obrigatórios mesmo quando `nao` (lista lacunas que justificam a decisão)

**Exportação:** o relatório é gerado como markdown e pode ser aberto em qualquer editor.

---

### 5.8 Feed de Reuniões — Histórico unificado

View transversal de todos os artefatos processados, independente de pessoa. Filtrável por tipo, pessoa e período. Permite revisitar qualquer evento rapidamente.

---

### 5.9 Módulo "Eu" (em desenvolvimento)

Cockpit sobre a própria jornada do gestor — não seus liderados, mas ele mesmo. Inclui:
- Feedbacks recebidos do próprio gestor
- Demandas e ações que foram delegadas ao usuário (extraídas de qualquer artefato)
- Ciclo de autoavaliação
- Histórico da própria evolução

---

## 6. Regras de negócio

### 6.1 Quem é a `pessoa_principal`

Regra central da ingestão. Toda decisão de roteamento do artefato depende deste campo.

- **1:1:** sempre o liderado presente (o gestor é o usuário, não entra)
- **Reunião coletiva com foco claro:** a pessoa cujo desenvolvimento é mais central
- **Reunião coletiva sem foco individual:** `null` → armazenado em `_coletivo`
- **Feedback:** a pessoa que recebeu ou é o sujeito do feedback
- **Regra de participação:** apenas quem participou diretamente do evento. Pessoas apenas mencionadas ("o Pedro disse que...") NÃO entram em `pessoas_identificadas`

### 6.2 Roteamento de ações comprometidas

- Se a ação foi comprometida por alguém registrado → vai para o `actions.yaml` dessa pessoa
- Se a ação foi comprometida em reunião coletiva → o sistema tenta inferir o `responsavel_slug` pelo nome; se encontrar correspondência no time, cria a entrada no `ActionRegistry` da pessoa correta
- Se o responsável é o próprio gestor (usuário do app) → campo `responsavel: "{managerName}"` (ou "Gestor" se não configurado), `owner: "gestor"`

### 6.3 Resolução de pontos de atenção

Quando um novo artefato é ingerido, o Claude analisa o perfil existente e identifica quais pontos de atenção anteriores foram claramente superados. Os pontos resolvidos são marcados automaticamente com ~~strikethrough~~ e data de resolução. Não há edição manual necessária.

### 6.4 Atualização do `ultimo_1on1`

Atualizado em dois casos:
1. O artefato tem `tipo === '1on1'`
2. O artefato tem `necessita_1on1 === false` — indica que um 1:1 informal aconteceu e não há urgência por outro

Isso evita a armadilha do "último 1:1 formal há 60 dias" quando na prática houve vários momentos bilaterais registrados como outros tipos.

### 6.5 Deduplicação de temas

`temas_detectados` de cada artefato contém os temas observados naquele evento. `temas_atualizados` é a lista completa e dedupada que integra os temas anteriores do perfil com os novos. Ao atualizar o perfil, a seção de Temas Recorrentes é **substituída integralmente** (não appendada) pela lista dedupada.

### 6.6 Indicador de saúde

O campo `saude` no frontmatter do perfil reflete o **último artefato ingerido**. Não é uma média. Se a pessoa estava verde por 3 meses e o último 1:1 mostrou sinal de burnout, o indicador vira vermelho imediatamente. O painel de risco do time captura essa mudança na próxima abertura do app.

### 6.7 Heurística do Pass 2

Pass 2 só roda se:
- `pessoa_principal` foi identificada e está cadastrada com `perfil.md` existente
- O perfil tem `total_artefatos >= 2` (há histórico suficiente para integrar)
- O artefato tem mais de 300 chars (artefatos muito curtos não geram ganho de contexto suficiente)
- O slug não é `_coletivo`

Isso evita 90s extras de processamento para dailies de 80 chars ou primeiras ingestões de pessoas novas.

### 6.8 Dados stale

Um perfil é considerado `dados_stale` se `ultima_ingestao` foi há mais de 30 dias. Isso é injetado em runtime no IPC handler — não persistido no disco. Quando `dados_stale === true`, os alertas gerados pela IA no perfil são suprimidos na pauta com o gestor, porque os dados podem não refletir mais a realidade atual.

### 6.10 Framing por relação

O `resumo_evolutivo` e os campos narrativos (`resumo`, `pontos_de_atencao`, `elogios_e_conquistas`) têm tom calibrado pelo tipo de relação da `pessoa_principal`:

| `relacao` | Perspectiva | Tom |
|-----------|-------------|-----|
| `liderado` | Desenvolvimento e evolução profissional | "demonstrou", "está evoluindo", "precisa de atenção em" |
| `gestor` | Alinhamento e relacionamento ascendente | "alinhamento sobre X", "suporte recebido em Y", "pontos de divergência em Z" |
| `par` | Colaboração horizontal | "colaboração em X", "dependência identificada em Y", "alinhamento necessário sobre Z" |
| `stakeholder` | Gestão de expectativas | "expectativa comunicada", "alinhamento sobre entrega", "risco de desalinhamento em" |

O campo `relacao` já está disponível no `serializeForPrompt()` — o prompt usa essa informação para ajustar o tom sem mudar o schema de saída.

---

### 6.9 Schema migration

Toda vez que o app lê um `perfil.md`, o módulo `ProfileMigration` verifica o `schema_version` e aplica migrações necessárias antes de retornar o conteúdo. A migração persiste no disco se houve mudança. É idempotente.

Versões:
- `v1 → v2`: remove `acoes_pendentes_count` do frontmatter (agora calculado em runtime)
- `v2 → v3`: corrige o open marker do bloco `conquistas` para ser único (era idêntico ao de `atencao`, causando bug de inserção no bloco errado)

---

## 7. Retroalimentações (loops de valor)

O Pulse Cockpit é um produto de **efeito acumulativo** — o valor cresce exponencialmente com o uso. Estes são os principais loops:

### Loop 1 — Ingestão → Perfil Vivo → Pauta melhor

```
Gestor ingere artefato
  → Claude analisa + integra com perfil existente (Pass 2)
    → Perfil Vivo fica mais rico (mais temas, mais histórico, resumo evolutivo atualizado)
      → Pauta do próximo 1:1 usa esse contexto mais rico
        → 1:1 é mais preciso → gera transcrição mais densa → ingestão produz mais inteligência
```

**Resultado:** a qualidade da pauta de 1:1 melhora continuamente com o tempo de uso.

### Loop 2 — Ingestão → Alertas → Ação do gestor → Nova ingestão

```
Gestor ingere artefato de uma reunião coletiva
  → Painel de risco identifica "Carlos — saúde amarela, necessita 1:1"
    → Gestor faz 1:1 com Carlos
      → Ingere a transcrição do 1:1
        → Painel mostra "Carlos — verde, 1:1 realizado há 2 dias"
```

**Resultado:** o app fecha o loop entre detecção de risco e ação do gestor.

### Loop 3 — Histórico acumulado → Relatório de ciclo → Defesa no fórum

```
6 meses de ingestões regulares
  → Perfil Vivo com 20+ artefatos, temas consolidados, linha do tempo de entregas
    → Relatório de ciclo gerado em < 2 min
      → Narrativa com evidências concretas
        → Defesa no fórum calibração com confiança
          → Resultado positivo para o liderado → gestor vê valor → aumenta frequência de ingestão
```

**Resultado:** o norte estrela (fórum de calibração) é cumprido, criando o principal argumento de retenção do produto.

### Loop 4 — Ação comprometida → Rastreamento → Cobrada na próxima pauta

```
Carlos compromete "entregar proposta de observabilidade até 22/03" num planning
  → ActionRegistry cria entrada estruturada com prazo
    → No próximo 1:1 (25/03), a pauta gerada diz:
      "Ação em aberto há 3 dias: Carlos ia entregar proposta de observabilidade até 22/03"
        → Gestor cobra com contexto específico
          → Carlos conclui → gestor marca como done no app
```

**Resultado:** a accountability de ações comprometidas deixa de depender da memória do gestor.

### Loop 5 — Pessoa detectada → Cadastro → Artefatos pendentes processados

```
Transcrição de uma reunião menciona "Fernanda Costa" (não cadastrada)
  → DetectedRegistry cria entrada pendente
    → UI mostra "1 pessoa detectada em artefatos, ainda não cadastrada"
      → Gestor cadastra Fernanda
        → syncPending() processa automaticamente todos os artefatos pendentes dela
          → Perfil Vivo de Fernanda já começa com histórico completo
```

**Resultado:** o onboarding de novos membros do time captura retroativamente tudo que já aconteceu.

---

## 8. Arquitetura técnica

### Stack

| Camada | Tecnologia | Decisão |
|--------|-----------|---------|
| Runtime | Electron + Node.js 20 | Desktop nativo, acesso direto ao FS, sem servidor |
| UI | React 18 + TypeScript | Ecossistema maduro, tipagem forte |
| Estilo | Tailwind CSS | Produtividade, dark mode |
| IA | Claude Code CLI (`claude -p`) | Usa subscription do usuário — sem API key adicional |
| Armazenamento | Markdown + YAML em disco | Transparente, portável, editável, versionável com git |
| File watching | chokidar | Watch robusto de diretórios no Electron |
| PDF | pdf-parse | Extração de texto de PDFs simples |
| Build | electron-vite + electron-builder | Dev server + build orquestrado + empacotamento macOS |

### Decisão crítica: Claude Code CLI, não API

O app invoca o Claude via `child_process.spawn('claude', ['-p', prompt])` no Main Process do Electron. Nunca usa `@anthropic-ai/sdk`, nunca lida com API keys.

**Por quê:** o usuário-alvo (gestor técnico) já tem Claude Code CLI instalado e autenticado com subscrição própria. Zero custo adicional, zero configuração de billing, zero risco de vazar API key em configs de app.

**Consequência:** o app detecta o path do binário via `which claude` e o persiste em `~/.pulsecockpit/settings.json`. Sem o CLI instalado, o app funciona apenas para leitura — todas as features de IA são bloqueadas.

### Estrutura do workspace (dados do usuário)

```
~/Pulse Cockpit/              ← path configurável pelo gestor
  inbox/
    processados/              ← arquivos após ingestão
  artefatos/
    1on1/template.md
    reuniao/template.md
    feedback/template.md
    [etc.]
  pessoas/
    {slug}/
      config.yaml             ← quem é a pessoa (manual)
      perfil.md               ← cockpit vivo (atualizado pela IA)
      actions.yaml            ← ações estruturadas
      historico/              ← artefatos processados vinculados
      pautas/                 ← pautas geradas
    _coletivo/
      historico/              ← artefatos sem pessoa_principal
  exports/                    ← relatórios de ciclo
```

Tudo é texto puro. O gestor pode abrir qualquer arquivo no Obsidian, Notion, VS Code. Pode versionar com git. Pode sincronizar com iCloud Drive ou Google Drive sem nenhuma configuração adicional.

### Arquitetura Electron (Main/Renderer)

```
Main Process (Node.js)
├── index.ts — BrowserWindow + todos os IPC handlers
├── ingestion/ — FileWatcher, Pipeline, ClaudeRunner, ArtifactWriter, SchemaValidator
├── registry/ — PersonRegistry, ActionRegistry, DetectedRegistry, SettingsManager
├── migration/ — ProfileMigration (schema versioning)
├── prompts/ — ingestion, cerimonia-sinal, agenda, agenda-gestor, cycle, compression, autoavaliacao
└── workspace/ — WorkspaceSetup (cria estrutura de pastas)

Renderer Process (React)
└── views/ — Dashboard, Inbox, Person, PersonForm, MeetingsFeed, Settings, Setup, [Eu]

IPC Bridge (preload/index.ts)
└── contextBridge → window.api (people, artifacts, detected, ingestion, ai, actions, settings)
```

### IPC — Canais principais

| Canal | Direção | O que faz |
|-------|---------|-----------|
| `people:list/get/save/delete` | renderer → main | CRUD do cadastro |
| `people:get-perfil` | renderer → main | Lê perfil.md com migration + injeta campos computados |
| `artifacts:list/feed/read` | renderer → main | Leitura de artefatos |
| `actions:list/update-status` | renderer → main | CRUD de ações |
| `ingestion:enqueue/queue` | renderer → main | Fila de processamento |
| `ai:generate-agenda` | renderer → main | Gera pauta (chama Claude) |
| `ai:cycle-report` | renderer → main | Gera relatório de ciclo (chama Claude) |
| `ingestion:started/completed/failed` | main → renderer | Push de status em tempo real |
| `ingestion:cerimonia-sinal-aplicado` | main → renderer | Sinal de cerimônia aplicado ao perfil de participante |

---

## 9. Modelo de dados detalhado

### `config.yaml` (por pessoa)

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
notas_manuais: "Está passando por mudança de time desde fevereiro."
alerta_ativo: false
motivo_alerta: null
criado_em: "2026-03-18T10:00:00Z"
atualizado_em: "2026-03-18T10:00:00Z"
```

### `perfil.md` frontmatter (schema v3)

```yaml
slug: "maria-silva"
schema_version: 3
ultima_atualizacao: "2026-03-21T10:00:00Z"
ultima_ingestao: "2026-03-21"
total_artefatos: 12
ultimo_1on1: "2026-03-15"
alertas_ativos: []
saude: "verde"
necessita_1on1: false
motivo_1on1: null
alerta_estagnacao: false
motivo_estagnacao: null
sinal_evolucao: true
evidencia_evolucao: "Liderou refatoração sozinha e recebeu elogio do time"
```

**Campos calculados em runtime (não persistidos):**
- `acoes_pendentes_count` — contagem de ações `open` no `ActionRegistry`
- `acoes_vencidas_count` — ações `open` com `prazo < hoje`
- `precisa_1on1_frequencia` — `dias_sem_1on1 > frequencia_1on1_dias + 3`
- `dias_sem_1on1` — dias desde `ultimo_1on1`
- `dados_stale` — `ultima_ingestao` há 30+ dias

### `actions.yaml` (por pessoa)

```yaml
actions:
  - id: "2026-03-15-maria-silva-0"
    personSlug: "maria-silva"
    texto: "Maria Silva: Apresentar proposta de observabilidade até 2026-03-22"  # legado — mantido para dedup
    descricao: "Apresentar proposta de observabilidade"                           # campo novo — exibido na UI como título
    responsavel: "Maria Silva"
    responsavel_slug: "maria-silva"
    prazo: "2026-03-22"
    owner: "liderado"           # gestor | liderado | terceiro
    prioridade: "media"
    status: "open"              # open | in_progress | done | cancelled
    criadoEm: "2026-03-15"
    concluidoEm: null
    fonteArtefato: "2026-03-15-maria-silva.md"
```

**Backward compat:** ações antigas sem o campo `descricao` continuam exibindo `texto` na UI.

---

## 10. Roadmap

### V1 — Núcleo (concluído e estável)

| Feature | Status |
|---------|--------|
| People Registry (CRUD com config.yaml) | ✅ |
| Inbox + Pipeline de ingestão two-pass | ✅ |
| Perfil Vivo (escrita, atualização, migração) | ✅ |
| Action Loop (actions.yaml estruturado) | ✅ |
| Pauta de 1:1 sob demanda | ✅ |
| Pauta com o gestor (roll-up do time) | ✅ |
| Relatório de Ciclo com flag de promovibilidade | ✅ |
| Dashboard + Painel de Riscos do Time | ✅ |
| Feed de Reuniões | ✅ |
| Módulo "Eu" (demandas, ciclo, autoavaliação) | ✅ |
| Suporte a reuniões coletivas (`_coletivo`) | ✅ |
| Detecção de pessoas não cadastradas | ✅ |
| Templates de artefato por tipo | ✅ |
| Processamento paralelo (max 3, per-person lock) | ✅ |
| Schema migration automática | ✅ |
| Pass de Cerimônia por pessoa (sinais individuais em reuniões coletivas) | ✅ |
| Framing narrativo por tipo de relação (liderado / gestor / par / stakeholder) | ✅ |
| Campo `descricao` separado em ações (UI mostra título limpo + responsável como metadata) | ✅ |
| Nome real do gestor nas ações via `managerName` nas settings | ✅ |

### V2 — Cockpit completo de gestão (planejado)

**Princípio:** V1 valida o núcleo `pessoas → reuniões → calibração`. V2 expande para o cockpit do **dia a dia operacional**, com dois novos primitivos:

#### Entidade Projeto

Análoga à entidade Pessoa. Cada projeto tem um `status.md` que cresce a cada reunião mencionada.

```
projetos/{slug}/
  config.yaml    ← nome, status, squad, objetivo
  status.md      ← perfil vivo: decisões, riscos, marcos, bloqueios
  historico/     ← artefatos que tocaram este projeto
```

Na ingestão V2, o pipeline identifica **pessoas E projetos** mencionados. O `actions.yaml` ganha o campo `projeto_slug` — retrocompatível com V1.

#### View Hoje / Esta Semana

```
Hoje, quinta 21/03
  Reuniões registradas: 1:1 Maria (15h), Planning Q2 (17h)
  Pautas pendentes: Maria não tem pauta gerada ⚠️
  Follow-ups vencendo esta semana: 3 ações
  Alertas: Carlos — 28 dias sem 1:1
```

Viável sem mudança no backend — os dados já existem no `LideradoSnapshot` e `ActionRegistry`. É uma view de leitura sobre o estado atual.

#### Integrações via MCP (não API nativa)

- **Jira:** daily report por pessoa, bloqueios, métricas de fluxo
- **Slack:** ingestão passiva de canais configurados. Adapter que escreve mensagens como `.md` em `inbox/` — o pipeline não muda

#### Outras features V2

- PDI com coleta automática de evidências ligadas a projetos e artefatos
- Insights cruzados do time (padrões que aparecem em múltiplas pessoas)
- Caso de promoção gerado pela IA com base em perfil + projetos + artefatos

### V3 — Proatividade e integrações externas

- Briefing pré-reunião proativo (integração com Google Calendar)
- Pergunta livre em linguagem natural sobre o time
- Notificações push macOS para alertas de gestão
- Skills de prompts configuráveis por perfil de gestor

---

## 11. Princípios que guiam as decisões

**Dados são seus.** Tudo fica em arquivos Markdown e YAML no computador do gestor. Sem servidor, sem nuvem proprietária. Editável em qualquer editor, versionável com git.

**Sem API key.** O Claude Code CLI com a assinatura do gestor é suficiente. Zero custo adicional, zero configuração de billing.

**Cada ingestão tem que valer.** O resultado imediato de jogar um arquivo é sempre visível — um artefato bem processado, um perfil atualizado, uma ação capturada. O valor não depende de usar o produto por semanas antes de aparecer.

**O app encontra o gestor.** Alertas surgem no Dashboard sem que o gestor precise perguntar. A pauta já está gerada antes do 1:1. O relatório de ciclo não exige que o gestor lembre de tudo — ele está acumulado.

**Privacidade first.** Dados sensíveis de RH (avaliações, feedbacks, PDIs) nunca saem do disco local do gestor. A única saída de dados é a chamada ao Claude CLI local, que usa a própria autenticação do gestor.

**Escopo estreito, feito bem.** V1 resolve um problema específico — chegar ao fórum de calibração com narrativa e evidências prontas. Features que não servem esse norte foram explicitamente descartadas para V1 (multi-usuário, sync próprio, mobile, integrações nativas com Jira/Slack).

---

## 12. Non-goals explícitos (V1)

- Multi-usuário ou workspaces compartilhados
- Sync em nuvem próprio (o gestor aponta o workspace para Drive/iCloud)
- App mobile
- Integração nativa com Jira e GitHub (V1 aceita exports como arquivo)
- Integração nativa com Slack ou Notion
- PDI com coleta automática de evidências
- Insights cruzados do time
- Briefing pré-reunião proativo
- Pergunta livre em linguagem natural
- Integração com Google Calendar
- Caso de promoção como documento separado
- Notificações push

---

*Pulse Cockpit · Desktop para macOS · Dados locais · Powered by Claude Code CLI*
