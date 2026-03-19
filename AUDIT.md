Você é um gestor sênior de engenharia que já liderou múltiplos times (5–20 pessoas) e construiu sistemas internos de apoio à gestão baseados em dados e IA.

Você tem visão prática, foco em execução e baixa tolerância a abstrações vagas.

---

## Contexto do produto

Estou construindo o "Pulse Cockpit".

Um app desktop onde eu faço ingestão de artefatos (1:1s, reuniões, dailies, feedbacks, PRs, etc.) em formatos como .md, .txt e .pdf.

A IA processa esses inputs e:

- Extrai ações, riscos, decisões, sentimentos e contexto
- Atualiza um "Perfil Vivo" por pessoa (histórico evolutivo contínuo)
- Gera:
  - pautas de 1:1
  - alertas de risco
  - relatórios de avaliação
  - visão sistêmica do time

Tudo baseado em dados acumulados ao longo do tempo.

---

## Tese do produto

Gestão não é sobre tarefas — é sobre contexto acumulado + interpretação consistente ao longo do tempo.

O Pulse Cockpit tenta transformar:
dados caóticos → memória estruturada → decisões melhores

---

## Objetivo da análise

Quero uma auditoria CRÍTICA do modelo, com foco em:

- consistência do sistema
- capacidade real de gerar valor no dia a dia
- robustez da retroalimentação (learning loop)
- riscos estruturais

---

## 1. Modelo de ingestão (Inbox → extração)

Avalie:

- Os tipos de input são suficientes ou falta algo crítico?
- Existe risco de viés dependendo do tipo de artefato?
- O modelo depende demais de transcrição (ex: reuniões) vs sinais objetivos?
- O sistema consegue lidar com dados incompletos / ruidosos de forma confiável?

👉 Diga claramente:
- o que está bom
- o que está frágil
- o que falta

---

## 2. Engine de extração (IA)

A IA extrai:
- ações
- riscos
- conquistas
- sentimento
- saúde (verde/amarelo/vermelho)
- necessidade de 1:1

Avalie:

- Esses outputs são suficientes para gestão real?
- O que está faltando que um gestor experiente observa?
- Existe risco de subjetividade excessiva?
- O modelo gera sinais acionáveis ou só texto bonito?

👉 Sugira melhorias no schema de extração

---

## 3. Perfil Vivo (core do produto)

Esse é o coração do sistema.

Avalie:

- O conceito de "reescrever o perfil a cada input" é correto ou arriscado?
- Existe risco de perder histórico ou distorcer narrativa?
- O modelo suporta análise longitudinal real (evidência de evolução)?
- Está mais próximo de:
  - log estruturado
  - ou narrativa subjetiva?

👉 Diga como deveria ser estruturado idealmente:
- o que é estado atual
- o que é histórico imutável
- o que é derivado

---

## 4. Loop de retroalimentação (learning system)

Avalie o ciclo completo:

input → extração → perfil → insights → novas ações → novos inputs

- Esse loop fecha de forma consistente?
- Existe risco de "lixo entrando → lixo saindo"?
- O sistema melhora ao longo do tempo ou só acumula dados?

👉 Aponte:
- gargalos do loop
- onde o sistema quebra na prática

---

## 5. Geração de insights

O sistema promete:

- pautas de 1:1 contextualizadas
- alertas proativos
- relatórios de avaliação

Avalie:

- Isso realmente seria útil no dia a dia de um gestor?
- Ou ainda está genérico / superficial?
- O que falta para isso virar algo confiável o suficiente para decisão?

👉 Liste:
- insights de alto valor que DEVEM existir
- insights que estão faltando

---

## 6. Action Loop

O sistema extrai e acompanha ações ao longo do tempo.

Avalie:

- Isso está bem modelado ou superficial?
- O sistema garante accountability real?
- Existe risco de ações se perderem ou ficarem ambíguas?

👉 Sugira um modelo melhor, se necessário

---

## 7. Principais riscos do produto

Seja direto:

- Onde esse produto pode falhar na prática?
- O que faria um gestor parar de usar em 2 semanas?
- O que compromete confiança no sistema?

---

## 8. Recomendações objetivas

Separe em:

### Ajustes imediatos (críticos)
O que eu PRECISO corrigir agora

### Melhorias de curto prazo
O que aumenta muito o valor

### Evoluções futuras
O que é opcional / escala

---

## 9. Templates obrigatórios (.md)

Defina templates mínimos para:

- 1:1
- reunião
- feedback
- cerimônia

Com foco em:
- padronização
- qualidade de extração
- redução de ambiguidade

---

## Regras de resposta

- Sem perguntas
- Sem teoria genérica
- Foco em decisão e execução
- Seja incisivo (se algo estiver ruim, diga claramente)
- Pense como usuário real no dia a dia
