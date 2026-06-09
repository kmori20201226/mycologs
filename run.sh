#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/logs"
API_PID="$PID_DIR/api.pid"
WEB_PID="$PID_DIR/web.pid"
API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/web.log"

if [[ -f "$SCRIPT_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    set +a
fi

mkdir -p "$PID_DIR" "$LOG_DIR"

# ── Helpers ────────────────────────────────────────────────────────────────────

is_running() {
    local pid_file="$1"
    local pid
    pid=$(cat "$pid_file" 2>/dev/null) || return 1
    kill -0 "$pid" 2>/dev/null
}

is_port_in_use() {
    nc -z -w 1 127.0.0.1 "$1" 2>/dev/null
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

stop_port() {
    local name="$1"
    local port="$2"
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null) || return 0
    [[ -z "$pids" ]] && return 0
    echo "  Stopping $name on port $port (PID $pids)..."
    kill $pids 2>/dev/null || true
    local i=0
    while lsof -ti:"$port" &>/dev/null && (( i++ < 20 )); do sleep 0.5; done
    lsof -ti:"$port" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
}

wait_for_port() {
    local port="$1"
    local name="$2"
    local i=0
    printf "  Waiting for %s on port %d" "$name" "$port"
    until nc -z -w 1 127.0.0.1 "$port" 2>/dev/null; do
        (( i++ > 60 )) && { echo " TIMEOUT"; return 1; }
        printf "."
        sleep 1
    done
    echo " OK"
}

# ── Stop ───────────────────────────────────────────────────────────────────────

do_stop() {
    echo "==> Stopping servers..."
    stop_pid_file "API" "$API_PID"
    stop_port "API" 3000
    stop_pid_file "Web" "$WEB_PID"
    stop_port "Web" 3001
    cd "$SCRIPT_DIR/ai-service"
    python -m mycologs_ai_service --stop 2>/dev/null || true
    cd "$SCRIPT_DIR"
    stop_port "AI service" 3002
    echo "    Done."
}

# ── Start ──────────────────────────────────────────────────────────────────────

do_start() {
    echo "==> Starting servers..."

    # API (port 3000)
    if is_running "$API_PID"; then
        echo "  API already running (PID $(cat "$API_PID"))."
    elif is_port_in_use 3000; then
        echo "  API port 3000 already in use — skipping."
    else
        echo "  Starting API... (log: $API_LOG)"
        nohup npm --workspace apps/api run dev >> "$API_LOG" 2>&1 &
        echo $! > "$API_PID"
        wait_for_port 3000 "API"
    fi

    # Web (port 3001)
    if is_running "$WEB_PID"; then
        echo "  Web already running (PID $(cat "$WEB_PID"))."
    elif is_port_in_use 3001; then
        echo "  Web port 3001 already in use — skipping."
    else
        echo "  Starting Web... (log: $WEB_LOG)"
        nohup npm --workspace apps/web run dev >> "$WEB_LOG" 2>&1 &
        echo $! > "$WEB_PID"
        wait_for_port 3001 "Web"
    fi

    # AI service (port 3002)
    if is_port_in_use 3002; then
        echo "  AI service port 3002 already in use — skipping."
    else
        echo "  Starting AI service..."
        cd "$SCRIPT_DIR/ai-service"
        python -m mycologs_ai_service --daemon
        cd "$SCRIPT_DIR"
    fi

    echo ""
    echo "  API        → http://localhost:3000"
    echo "  Web        → http://localhost:3001"
    echo "  AI service → http://localhost:3002"
    echo ""
    echo "  Logs:"
    echo "    API  → $API_LOG"
    echo "    Web  → $WEB_LOG"
    echo "    AI   → $LOG_DIR/ai-service.log"
    echo ""
    echo "  Tail all logs:  tail -f $LOG_DIR/*.log"
}

# ── Status ─────────────────────────────────────────────────────────────────────

do_status() {
    echo "==> Server status:"
    if is_running "$API_PID"; then
        echo "  API        RUNNING (PID $(cat "$API_PID"))"
    else
        echo "  API        STOPPED"
    fi
    if is_running "$WEB_PID"; then
        echo "  Web        RUNNING (PID $(cat "$WEB_PID"))"
    else
        echo "  Web        STOPPED"
    fi
    if is_port_in_use 3002; then
        echo "  AI service RUNNING (port 3002)"
    else
        echo "  AI service STOPPED"
    fi
}

# ── Logs ───────────────────────────────────────────────────────────────────────

do_logs() {
    local target="${2:-all}"
    case "$target" in
        api)  tail -f "$API_LOG" ;;
        web)  tail -f "$WEB_LOG" ;;
        ai)   tail -f "$LOG_DIR/ai-service.log" ;;
        all)  tail -f "$LOG_DIR"/*.log ;;
        *)
            echo "Usage: $0 logs [api|web|ai|all]"
            exit 1
            ;;
    esac
}

# ── Buy credit ─────────────────────────────────────────────────────────────────

do_buy_credit() {
    shift
    if [[ -z "${1:-}" ]]; then
        echo "Usage: $0 buy-credit <email|user-id|club:ID> [amount]"
        exit 1
    fi
    cd "$SCRIPT_DIR"
    npx ts-node scripts/buy-credit.ts "$@"
}

# ── Help ───────────────────────────────────────────────────────────────────────

do_help() {
    cat <<EOF
Usage: $0 {start|stop|restart|status|logs [api|web|ai|all]|buy-credit}

  start    Start API, web, and AI service (logs to $LOG_DIR/)
  stop     Stop all servers
  restart  Stop then start all servers
  status   Show running state of each server
  logs     Tail logs (default: all)
             $0 logs api
             $0 logs web
             $0 logs ai
             $0 logs all
  buy-credit <email|user-id|club:ID> [amount]
           Add credit (default 1000) and keep a fake subscription active for 1 month
EOF
}

# ── Dispatch ───────────────────────────────────────────────────────────────────

case "${1:-help}" in
    start)   do_start ;;
    stop)    do_stop ;;
    restart) do_stop; echo; do_start ;;
    status)  do_status ;;
    logs)    do_logs "$@" ;;
    buy-credit) do_buy_credit "$@" ;;
    help|--help|-h) do_help ;;
    *)
        echo "Unknown command: $1"
        echo
        do_help
        exit 1
        ;;
esac
