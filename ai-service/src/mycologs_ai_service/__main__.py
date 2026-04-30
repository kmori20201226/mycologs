"""
Entry point for the `mycologs-ai-service` CLI command.

Usage (after pip install):
    mycologs-ai-service                          # foreground (default)
    mycologs-ai-service --daemon                 # start as background daemon
    mycologs-ai-service --stop                   # stop running daemon
    mycologs-ai-service --status                 # check if daemon is running
    mycologs-ai-service --port 9000 --daemon
    mycologs-ai-service --host 127.0.0.1 --reload
"""

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
import uvicorn


# ──────────────────────────────────────────────────────────────────────────────
# PID file helpers
# ──────────────────────────────────────────────────────────────────────────────

_PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DEFAULT_PID_FILE = _PROJECT_ROOT / ".pids" / "ai-service.pid"
DEFAULT_LOG_FILE = _PROJECT_ROOT / "logs" / "ai-service.log"


def _write_pid(pid_file: str, pid: int) -> None:
    with open(pid_file, "w") as f:
        f.write(str(pid))


def _read_pid(pid_file: str) -> int | None:
    try:
        with open(pid_file) as f:
            return int(f.read().strip())
    except (FileNotFoundError, ValueError):
        return None


def _remove_pid(pid_file: str) -> None:
    try:
        os.remove(pid_file)
    except FileNotFoundError:
        pass


def _is_running(pid: int) -> bool:
    """Return True if a process with this PID is alive."""
    try:
        os.kill(pid, 0)   # signal 0 = existence check, no actual signal sent
        return True
    except (ProcessLookupError, PermissionError):
        return False


# ──────────────────────────────────────────────────────────────────────────────
# Daemon lifecycle commands
# ──────────────────────────────────────────────────────────────────────────────

def cmd_stop(pid_file: str) -> None:
    pid = _read_pid(pid_file)
    if pid is None:
        print("No PID file found — daemon is not running.")
        sys.exit(1)
    if not _is_running(pid):
        print(f"PID {pid} is not running (stale PID file removed).")
        _remove_pid(pid_file)
        sys.exit(1)

    print(f"Stopping daemon (PID {pid})...")
    os.kill(pid, signal.SIGTERM)

    # Wait up to 10 s for the process to exit
    for _ in range(20):
        time.sleep(0.5)
        if not _is_running(pid):
            _remove_pid(pid_file)
            print("Daemon stopped.")
            return

    print("Daemon did not stop within 10 s — sending SIGKILL.")
    os.kill(pid, signal.SIGKILL)
    _remove_pid(pid_file)


def cmd_status(pid_file: str) -> None:
    pid = _read_pid(pid_file)
    if pid is None:
        print("Daemon is NOT running (no PID file).")
        sys.exit(1)
    if _is_running(pid):
        print(f"Daemon is running (PID {pid}).")
    else:
        print(f"Daemon is NOT running (stale PID file for PID {pid}).")
        _remove_pid(pid_file)
        sys.exit(1)


def _start_as_daemon(args) -> None:
    """Start the server as a detached background process.

    Uses subprocess.Popen with start_new_session + close_fds so the child
    starts with a clean set of file descriptors and no inherited sockets.
    """
    existing = _read_pid(str(args.pid_file))
    if existing and _is_running(existing):
        print(f"Daemon is already running (PID {existing}).")
        sys.exit(1)

    Path(args.log_file).parent.mkdir(parents=True, exist_ok=True)
    Path(args.pid_file).parent.mkdir(parents=True, exist_ok=True)

    cmd = [sys.executable, "-m", "mycologs_ai_service",
           "--host", args.host, "--port", str(args.port)]

    with open(args.log_file, "a") as lf:
        proc = subprocess.Popen(
            cmd,
            stdout=lf,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
            close_fds=True,
        )

    _write_pid(str(args.pid_file), proc.pid)
    print(f"Daemon started — PID {proc.pid}, log: {args.log_file}")
    sys.exit(0)


# ──────────────────────────────────────────────────────────────────────────────
# Logging config
# ──────────────────────────────────────────────────────────────────────────────

_LOG_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "()": "uvicorn.logging.DefaultFormatter",
            "fmt": "%(asctime)s %(levelprefix)s %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
            "use_colors": False,
        },
        "access": {
            "()": "uvicorn.logging.AccessFormatter",
            "fmt": '%(asctime)s %(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
            "datefmt": "%Y-%m-%d %H:%M:%S",
            "use_colors": False,
        },
    },
    "handlers": {
        "default": {"formatter": "default", "class": "logging.StreamHandler", "stream": "ext://sys.stderr"},
        "access":  {"formatter": "access",  "class": "logging.StreamHandler", "stream": "ext://sys.stdout"},
    },
    "loggers": {
        "uvicorn":        {"handlers": ["default"], "level": "INFO", "propagate": False},
        "uvicorn.error":  {"level": "INFO"},
        "uvicorn.access": {"handlers": ["access"],  "level": "INFO", "propagate": False},
    },
}


# ──────────────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Mycologs AI Service — FastAPI server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  mycologs-ai-service                       # run in foreground
  mycologs-ai-service --daemon              # start as daemon
  mycologs-ai-service --stop                # stop the daemon
  mycologs-ai-service --status              # check daemon status
  mycologs-ai-service --daemon --port 9000  # daemon on custom port
        """,
    )

    # Server options
    parser.add_argument("--host",     default="0.0.0.0",         help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port",     default=3002, type=int,    help="Bind port (default: 3002)")
    parser.add_argument("--reload",   action="store_true",       help="Enable auto-reload — foreground only")

    # Daemon options
    parser.add_argument("--daemon", "-d",  action="store_true",       help="Run as a background daemon")
    parser.add_argument("--stop", "--kill", "-k",    action="store_true",       help="Stop the running daemon")
    parser.add_argument("--status",   action="store_true",       help="Print daemon status")
    parser.add_argument("--pid-file", default=DEFAULT_PID_FILE,  help=f"PID file path (default: {DEFAULT_PID_FILE})")
    parser.add_argument("--log-file", default=DEFAULT_LOG_FILE,  help=f"Daemon log file (default: {DEFAULT_LOG_FILE})")

    args = parser.parse_args()

    # ── Lifecycle commands ───────────────────────────────────────────────────
    if args.stop:
        cmd_stop(args.pid_file)
        return

    if args.status:
        cmd_status(args.pid_file)
        return

    # ── Start server ─────────────────────────────────────────────────────────
    if os.environ.get('ANTHROPIC_API_KEY') is None:
        print("Environment variable ANTHROPIC_API_KEY should be set")
        sys.exit(1)

    if args.daemon:
        if args.reload:
            print("--reload is not supported in daemon mode.")
            sys.exit(1)
        _start_as_daemon(args)

    uvicorn.run(
        "mycologs_ai_service.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_config=_LOG_CONFIG,
    )


if __name__ == "__main__":
    main()
