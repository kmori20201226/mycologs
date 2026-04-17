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
import sys
import time
from pathlib import Path
import uvicorn


# ──────────────────────────────────────────────────────────────────────────────
# PID file helpers
# ──────────────────────────────────────────────────────────────────────────────

DEFAULT_PID_FILE = Path(__file__).parent / "mycologs_ai_service.pid"
DEFAULT_LOG_FILE = Path(__file__).parent / "mycologs_ai_service.log"


def _write_pid(pid_file: str) -> None:
    with open(pid_file, "w") as f:
        f.write(str(os.getpid()))


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


# ──────────────────────────────────────────────────────────────────────────────
# Daemonise (double-fork)
# ──────────────────────────────────────────────────────────────────────────────

def _daemonize(pid_file: str, log_file: str) -> None:
    """
    Detach the process from the terminal using the Unix double-fork technique.

    After this call returns the current process IS the daemon child.
    stdin is redirected to /dev/null; stdout/stderr go to log_file.
    """
    # Guard: don't start a second daemon
    existing = _read_pid(pid_file)
    if existing and _is_running(existing):
        print(f"Daemon is already running (PID {existing}).")
        sys.exit(1)

    # --- Fork 1: detach from terminal session ---
    pid = os.fork()
    if pid > 0:
        print(f"Daemon started — PID {os.getpid()}, log: {log_file}")
        sys.exit(0)

    os.setsid()   # become session leader

    # --- Fork 2: prevent re-acquiring a controlling terminal ---
    pid = os.fork()
    if pid > 0:
        sys.exit(0)

    # We are now the daemon process.
    os.umask(0o022)
    os.chdir("/")

    # Redirect standard file descriptors
    sys.stdout.flush()
    sys.stderr.flush()

    with open("/dev/null", "r") as dev_null:
        os.dup2(dev_null.fileno(), sys.stdin.fileno())

    log = open(log_file, "a", buffering=1)   # line-buffered
    os.dup2(log.fileno(), sys.stdout.fileno())
    os.dup2(log.fileno(), sys.stderr.fileno())

    # Write PID file and arrange cleanup on exit
    _write_pid(pid_file)
    import atexit
    atexit.register(_remove_pid, pid_file)


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
        _daemonize(args.pid_file, args.log_file)

    uvicorn.run(
        "mycologs_ai_service.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()