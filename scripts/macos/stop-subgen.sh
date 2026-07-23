#!/bin/zsh

set -u

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/subgen"
PID_FILE="$STATE_DIR/server.pid"
LAUNCHER_PID_FILE="$STATE_DIR/launcher.pid"

if [[ ! -f "$PID_FILE" && ! -f "$LAUNCHER_PID_FILE" ]]; then
  osascript -e 'display notification "No managed server is running" with title "Subgen"' >/dev/null
  exit 0
fi

for pid_file in "$PID_FILE" "$LAUNCHER_PID_FILE"; do
  [[ -f "$pid_file" ]] || continue
  managed_pid="$(<"$pid_file")"
  kill "$managed_pid" 2>/dev/null || true
done

rm -f "$PID_FILE" "$LAUNCHER_PID_FILE"
osascript -e 'display notification "Server stopped" with title "Subgen"' >/dev/null
