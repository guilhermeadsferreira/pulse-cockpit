#!/bin/bash
# Bloqueia o encerramento da sessão se código foi alterado mas os docs do pm-agent não.
set -euo pipefail

PM_AGENT_DIR="/Users/guilhermeaugusto/Documents/workspace-projects/pm-agent/projects/pulse-cockpit"
SESSION_FILE="/tmp/pulse-cockpit-session-${CLAUDE_SESSION_ID:-unknown}"

# Commit no início da sessão
START_COMMIT=$(head -1 "$SESSION_FILE" 2>/dev/null || echo "unknown")
CURRENT_COMMIT=$(git -C "$CLAUDE_PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")

# Arquivos src/ com mudanças não commitadas
UNCOMMITTED_SRC=$(git -C "$CLAUDE_PROJECT_DIR" diff --name-only HEAD 2>/dev/null | grep -c "^src/" || echo "0")

# Se não houve mudança de código nesta sessão, aprova
if [ "$START_COMMIT" = "$CURRENT_COMMIT" ] && [ "$UNCOMMITTED_SRC" = "0" ]; then
  printf '{"decision":"approve"}\n'
  exit 0
fi

# Código mudou — verifica se docs do pm-agent foram tocados desde o início da sessão
if [ -f "$SESSION_FILE" ]; then
  DOCS_UPDATED=$(find "$PM_AGENT_DIR/docs" "$PM_AGENT_DIR/tasks" -name "*.md" -newer "$SESSION_FILE" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$DOCS_UPDATED" -gt "0" ]; then
    printf '{"decision":"approve"}\n'
    exit 0
  fi
fi

# Bloqueia — docs não atualizados
printf '{"decision":"block","reason":"Código alterado nesta sessão mas documentação do pm-agent não foi atualizada.\n\nChecklist obrigatório:\n- [ ] docs/PRODUCT_STATUS.md — features adicionadas ou concluídas\n- [ ] tasks/done.md — tasks concluídas nesta sessão\n- [ ] tasks/backlog.md — marcar itens implementados como [x]\n\nCaminho: %s\n\nAtualize os docs antes de encerrar."}\n' "$PM_AGENT_DIR"
exit 0
