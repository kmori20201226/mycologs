#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
API_PID="$PID_DIR/api.pid"
WEB_PID="$PID_DIR/web.pid"

# ── Load .env ──────────────────────────────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    set +a
fi

mkdir -p "$PID_DIR"

# ── Helpers ────────────────────────────────────────────────────────────────────

is_running() {
    local pid_file="$1"
    local pid
    pid=$(cat "$pid_file" 2>/dev/null) || return 1
    kill -0 "$pid" 2>/dev/null
}

is_port_in_use() {
    nc -z 127.0.0.1 "$1" 2>/dev/null
}

stop_pid_file() {
    local name="$1"
    local pid_file="$2"
    local pid
    pid=$(cat "$pid_file" 2>/dev/null) || return 0
    if kill -0 "$pid" 2>/dev/null; then
        echo "  Stopping $name (PID $pid)..."
        kill "$pid" 2>/dev/null || true
        local i=0
        while kill -0 "$pid" 2>/dev/null && (( i++ < 20 )); do sleep 0.5; done
        kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
}

wait_for_port() {
    local port="$1"
    local name="$2"
    local i=0
    printf "  Waiting for %s on port %d" "$name" "$port"
    until nc -z 127.0.0.1 "$port" 2>/dev/null; do
        (( i++ > 30 )) && { echo " TIMEOUT"; return 1; }
        printf "."
        sleep 1
    done
    echo " OK"
}

# ── Stop all ───────────────────────────────────────────────────────────────────

do_stop() {
    echo "==> Stopping all servers..."
    stop_pid_file "API" "$API_PID"
    stop_pid_file "Frontend" "$WEB_PID"
    cd "$SCRIPT_DIR/ai-service"
    python -m mycologs_ai_service --stop 2>/dev/null || true
    cd "$SCRIPT_DIR"
    echo "    Done."
}

# ── Start all ──────────────────────────────────────────────────────────────────

do_start() {
    echo "==> Starting all servers..."

    # 1. API (port 3000) — must start before frontend so Next.js picks 3001
    if is_running "$API_PID"; then
        echo "  API is already running (PID $(cat "$API_PID"))."
    elif is_port_in_use 3000; then
        echo "  API port 3000 already in use — skipping start."
    else
        echo "  Starting API..."
        nohup npm --workspace apps/api run dev > /dev/null 2>&1 &
        echo $! > "$API_PID"
        wait_for_port 3000 "API"
    fi

    # 2. Frontend (port 3001 — Next.js auto-picks next free port)
    if is_running "$WEB_PID"; then
        echo "  Frontend is already running (PID $(cat "$WEB_PID"))."
    elif is_port_in_use 3001; then
        echo "  Frontend port 3001 already in use — skipping start."
    else
        echo "  Starting Frontend..."
        nohup npm --workspace apps/web run dev > /dev/null 2>&1 &
        echo $! > "$WEB_PID"
        wait_for_port 3001 "Frontend"
    fi

    # 3. AI service (port 3002, built-in daemon)
    echo "  Starting AI service..."
    cd "$SCRIPT_DIR/ai-service"
    python -m mycologs_ai_service --daemon 2>/dev/null || true
    cd "$SCRIPT_DIR"
    wait_for_port 3002 "AI service"

    echo ""
    echo "  API       → http://localhost:3000"
    echo "  Frontend  → http://localhost:3001"
    echo "  AI service→ http://localhost:3002"
    echo ""
    echo "  Logs → $SCRIPT_DIR/logs/"
}

# ── Status ─────────────────────────────────────────────────────────────────────

do_status() {
    echo "==> Server status:"
    if is_running "$API_PID"; then
        echo "  API       RUNNING (PID $(cat "$API_PID"))"
    else
        echo "  API       STOPPED"
    fi
    if is_running "$WEB_PID"; then
        echo "  Frontend  RUNNING (PID $(cat "$WEB_PID"))"
    else
        echo "  Frontend  STOPPED"
    fi
    cd "$SCRIPT_DIR/ai-service"
    python -m mycologs_ai_service --status 2>/dev/null || true
    cd "$SCRIPT_DIR"
}

# ── Dispatch ───────────────────────────────────────────────────────────────────

case "${1:-start}" in
    start)   do_start ;;
    stop)    do_stop ;;
    restart) do_stop; echo; do_start ;;
    status)  do_status ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
