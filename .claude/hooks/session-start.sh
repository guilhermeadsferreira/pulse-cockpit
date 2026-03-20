#!/bin/bash
# Registra o estado do repo no início da sessão para o check-docs.sh comparar depois.
SESSION_FILE="/tmp/pulse-cockpit-session-${CLAUDE_SESSION_ID:-unknown}"
git -C "$CLAUDE_PROJECT_DIR" rev-parse HEAD > "$SESSION_FILE" 2>/dev/null || echo "unknown" > "$SESSION_FILE"
