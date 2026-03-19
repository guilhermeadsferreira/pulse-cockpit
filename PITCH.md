# Pulse Cockpit

> O copiloto de gestão que aprende com tudo que já aconteceu.

---

## O problema

Gestores de tecnologia vivem num estado de sobrecarga de contexto.

Você tem 1:1s, dailies, plannings, retros, mensagens no Slack, e-mails, notas soltas — e de tudo isso precisa extrair o que importa: quem está bem, quem está travado, quem precisa de um 1:1 urgente, o que você prometeu, o que delegou, o que está em risco.

O resultado na prática: gestão de cabeça. Contexto que se perde. Pautas genéricas. Feedbacks que demoram. Liderados que sentem que o gestor "não lembra" o que aconteceu.

Ferramentas de task manager não resolvem — elas gerenciam tarefas, não pessoas. Ferramentas de RH são burocráticas e retroativas. Nenhuma delas aprende com o que acontece no seu dia a dia.

---

## O que é o Pulse Cockpit

Um app desktop para gestores de tecnologia que transforma tudo que já aconteceu — reuniões, 1:1s, feedbacks, dailies — num sistema vivo de gestão do time.

Você joga uma transcrição, anotação ou PDF na inbox. O Pulse Cockpit faz o resto.

---

## A mágica: como funciona

### 1. Você arrasta um arquivo para a Inbox

Pode ser qualquer coisa:
- Transcrição automática de um 1:1 (Gemini, Otter, Fireflies)
- Anotações de uma daily ou planning
- Notas de feedback que você escreveu
- Transcrição de um pós-warroom com 6 pessoas de times diferentes

O Pulse Cockpit aceita `.md`, `.txt` e `.pdf`.

### 2. A IA analisa e extrai o que importa

Por baixo dos panos, o Claude — usando a sua própria assinatura do Claude Code, sem nenhuma API key adicional — lê o artefato e extrai:

- Quem estava presente
- O que foi discutido
- Ações comprometidas (responsável, descrição, prazo)
- Pontos de atenção e riscos
- Conquistas e reconhecimentos
- Um indicador de saúde (verde / amarelo / vermelho)
- Sentimento detectado e nível de engajamento
- Se há necessidade urgente de um 1:1
- Sinais de evolução ou estagnação
- Quais pontos de atenção anteriores foram resolvidos

Tudo isso mesmo que a transcrição esteja cheia de erros, palavras cortadas ou caracteres estranhos. A IA interpreta o contexto e escreve texto limpo.

### 3. O perfil vivo de cada pessoa é atualizado

Cada pessoa do seu time tem um **Perfil Vivo** — um documento que cresce com cada artefato ingerido. Ele acumula:

- Resumo evolutivo narrativo (o que mudou desde o último contato)
- Histórico de artefatos com links
- Ações pendentes com responsável e prazo
- Pontos de atenção ativos (com resolução automática quando superados)
- Conquistas e elogios
- Temas recorrentes
- Indicador de saúde atual

A cada novo arquivo que você joga, o perfil é reescrito com o novo contexto integrado ao histórico.

### 4. O contexto acumulado alimenta tudo

Com o perfil vivo construído ao longo do tempo, o Pulse Cockpit consegue:

**Gerar pautas de 1:1 que parecem ter sido escritas por alguém que conhece a pessoa de verdade.**
Não é uma lista genérica de perguntas. É: "a Ana está há 3 semanas sem avançar no PDI, tem uma ação comprometida em aberto desde o mês passado, e o último artefato mostrou sinal de frustração com o processo de deploy. A pauta dela foca nisso."

**Emitir alertas antes que seja tarde.**
O sistema sabe que você não faz 1:1 com o João há 28 dias e a frequência combinada é 14 dias. Ele sabe que o Carlos está com saúde amarela há duas semanas seguidas. O painel de riscos do time mostra quem precisa de atenção agora, antes mesmo de você abrir o cockpit individual.

**Gerar relatório de ciclo de avaliação em segundos.**
Selecione a pessoa e o período. O Claude lê todos os artefatos do período, cruza com o perfil vivo, e gera uma síntese estruturada — pronta para usar numa conversa de performance. Inclui flag de promovibilidade com bullets de evidência concretos e citáveis no fórum de calibração.

---

## Features

### Cockpit de cada pessoa
- Perfil vivo com indicador de saúde, temas recorrentes, ações pendentes
- Histórico completo de artefatos com preview
- Histórico de pautas anteriores

### Inbox inteligente
- Drag & drop de arquivos
- Processamento paralelo (até 3 simultâneos) com fila e status visual
- Detecção automática de pessoas novas (ainda não cadastradas)
- Suporte a reuniões coletivas — pós-warrooms, all-hands, reuniões entre áreas. Nenhum cadastro necessário.
- Templates de artefato prontos para cada tipo (1:1, reunião, feedback, planning, retro, daily)

### Pautas geradas por IA
- Para **liderados**: baseada no perfil acumulado, ações em aberto, pontos de atenção, sinais de evolução
- Para **gestores**: roll-up do time — estado de saúde dos seus liderados diretos (que são os liderados indiretos do seu gestor), conquistas, escaladas, o que você precisa do seu gestor

### Action Loop
- Ações comprometidas extraídas automaticamente dos artefatos, com responsável e prazo estruturados
- Reuniões coletivas: ações roteadas para o ActionRegistry de cada responsável automaticamente
- Rastreamento de ações vencidas (prazo passou sem resolução)
- Superficies nas pautas: "essa ação está em aberto há 18 dias"

### Painel de Riscos do Time
- Visão consolidada de quem precisa de atenção agora
- Gatilhos: saúde vermelha, 1:1 atrasado por frequência, 1:1 urgente por conteúdo, ações vencidas, estagnação, dados desatualizados
- Ordenado por número de sinais de risco

### Feed de Reuniões
- Histórico unificado de todos os artefatos processados
- Filtro por tipo (1:1, planning, retro, daily, feedback)
- Busca por texto, pessoa ou tema

### Relatório de Ciclo
- Síntese estruturada do período com linha do tempo, entregas, padrões de comportamento, evolução e conclusão para o fórum
- **Flag de promovibilidade** com 3–5 bullets de evidência concretos e citáveis
- Exportado como markdown para incluir em documentos de RH

### Perfis de relacionamento
O Pulse Cockpit entende que seu time não é só de liderados diretos. Você cadastra e rastreia:
- **Liderados** — seu time direto, foco principal
- **Pares** — colegas de mesmo nível com quem você colabora
- **Gestores** — seu próprio gestor; a pauta com ele inclui o roll-up do seu time
- **Stakeholders** — pessoas de outras áreas que impactam seu trabalho

---

## Princípios técnicos que importam para você

**Seus dados são seus.**
Tudo fica em arquivos Markdown e YAML no seu computador — ou no seu iCloud Drive / Google Drive, se quiser. Nenhum servidor. Nenhuma nuvem proprietária. Você pode abrir, editar e versionar qualquer arquivo com git.

**Sem API key.**
O Pulse Cockpit usa o Claude Code CLI com a sua própria assinatura. Sem custo adicional, sem chave de API, sem configuração de billing.

**Funciona offline.**
Nenhuma funcionalidade depende de internet, exceto a chamada ao Claude CLI quando você processa um artefato.

**O que você ingeriu, você pode ler.**
Cada artefato processado vira um `.md` legível por humanos. O perfil vivo é um markdown que você pode abrir no Obsidian, Notion ou qualquer editor.

---

## O que está vindo

- **Módulo "Eu"** — cockpit sobre sua própria jornada: feedbacks que você recebeu do gestor, tarefas que foram delegadas a você em qualquer canal (reunião, Jira, daily, retro), seu desenvolvimento ao longo do tempo
- **Integração com Jira** via MCP — snapshot diário do board por pessoa, bloqueios, métricas de fluxo
- **Integração com Slack** via MCP — ingestão passiva de mensagens de canais configurados
- **View Hoje / Esta Semana** — o que precisa da sua atenção agora

---

## Para quem é

Gestores de tecnologia — tech leads, coordenadores, gerentes de engenharia — que têm entre 3 e 15 pessoas para gerir e querem parar de gerir de cabeça.

Se você já usou Notion, Linear ou Obsidian e gostou da ideia de dados como arquivos, vai se sentir em casa.

---

*Pulse Cockpit — desktop app para macOS · dados locais · powered by Claude Code CLI*
