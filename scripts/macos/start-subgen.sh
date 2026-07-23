#!/bin/zsh

set -u

PROJECT_DIR="/Users/oliver/Docs/Coding/subtitle-generator"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/subgen"
PID_FILE="$STATE_DIR/server.pid"
LAUNCHER_PID_FILE="$STATE_DIR/launcher.pid"
LOG_FILE="$STATE_DIR/server.log"
PORT=3210
URL="http://localhost:$PORT"

mkdir -p "$STATE_DIR"

if [[ -f "$PID_FILE" ]]; then
  server_pid="$(<"$PID_FILE")"
  if kill -0 "$server_pid" 2>/dev/null; then
    open "$URL"
    osascript -e 'display notification "Already running at localhost:3210" with title "Subgen"' >/dev/null
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if [[ -x /opt/homebrew/bin/bun ]]; then
  BUN_BIN=/opt/homebrew/bin/bun
elif [[ -x "$HOME/.bun/bin/bun" ]]; then
  BUN_BIN="$HOME/.bun/bin/bun"
else
  osascript -e 'display alert "Could not start Subgen" message "Bun is not installed or could not be found." as critical'
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
nohup "$BUN_BIN" run dev --hostname 127.0.0.1 --port "$PORT" >"$LOG_FILE" 2>&1 &
launcher_pid=$!
echo "$launcher_pid" >"$LAUNCHER_PID_FILE"

for _ in {1..40}; do
  if curl --silent --fail --output /dev/null "$URL"; then
    server_pid="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t | head -n 1)"
    if [[ -n "$server_pid" ]]; then
      echo "$server_pid" >"$PID_FILE"
    fi
    open "$URL"
    osascript -e 'display notification "Running at localhost:3210" with title "Subgen started"' >/dev/null
    exit 0
  fi
  if ! kill -0 "$launcher_pid" 2>/dev/null; then
    rm -f "$PID_FILE" "$LAUNCHER_PID_FILE"
    osascript -e 'display alert "Subgen failed to start" message "See ~/.local/state/subgen/server.log for details." as critical'
    exit 1
  fi
  sleep 0.25
done

open "$URL"
osascript -e 'display notification "Still starting; opening localhost:3210" with title "Subgen"' >/dev/null
