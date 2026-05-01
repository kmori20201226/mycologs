"""mycologs — unified dev/sandbox controller."""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path


# ---------------------------------------------------------------------------
# .env loader (no external dependencies)
# ---------------------------------------------------------------------------

def _load_dotenv(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        env[key] = val
    return env


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _wait_for_port(port: int, name: str, timeout: int = 60) -> bool:
    print(f"  Waiting for {name} on port {port}", end="", flush=True)
    for _ in range(timeout):
        if _port_in_use(port):
            print(" OK")
            return True
        print(".", end="", flush=True)
        time.sleep(1)
    print(" TIMEOUT")
    return False


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def _read_pid(pid_file: Path) -> int | None:
    try:
        return int(pid_file.read_text().strip())
    except Exception:
        return None


def _is_running(pid_file: Path) -> bool:
    pid = _read_pid(pid_file)
    return pid is not None and _pid_alive(pid)


def _pids_on_port(port: int) -> list[int]:
    """Return PIDs of processes listening on the given port via lsof."""
    try:
        out = subprocess.check_output(
            ["lsof", "-ti", f":{port}"], stderr=subprocess.DEVNULL
        )
        return [int(p) for p in out.decode().split() if p.strip().isdigit()]
    except subprocess.CalledProcessError:
        return []


def _kill_pid(pid: int) -> None:
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    for _ in range(40):
        if not _pid_alive(pid):
            return
        time.sleep(0.25)
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def _stop_service(name: str, pid_file: Path, port: int) -> None:
    """Stop by PID file, then kill any remaining process on the port."""
    pid = _read_pid(pid_file)
    if pid and _pid_alive(pid):
        print(f"  Stopping {name} (PID {pid})…")
        _kill_pid(pid)
    pid_file.unlink(missing_ok=True)

    for pid in _pids_on_port(port):
        if _pid_alive(pid):
            print(f"  Killing {name} on port {port} (PID {pid})…")
            _kill_pid(pid)


def _env_with_dotenv(dotenv_path: Path) -> dict[str, str]:
    """Return os.environ merged with values from a .env file."""
    env = dict(os.environ)
    env.update(_load_dotenv(dotenv_path))
    return env


def _run(cmd: list[str], cwd: Path | None = None, check: bool = True) -> int:
    result = subprocess.run(cmd, cwd=cwd)
    if check and result.returncode != 0:
        sys.exit(result.returncode)
    return result.returncode


# ---------------------------------------------------------------------------
# Development mode
# ---------------------------------------------------------------------------

class DevMode:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.pid_dir = root / ".pids"
        self.pid_dir.mkdir(exist_ok=True)
        self.api_pid = self.pid_dir / "api.pid"
        self.web_pid = self.pid_dir / "web.pid"

    def _start_service(self, name: str, cmd: list[str], pid_file: Path, port: int) -> None:
        if _is_running(pid_file):
            print(f"  {name} already running (PID {_read_pid(pid_file)}).")
            return
        if _port_in_use(port):
            # Adopt the existing process so stop can manage it later
            pids = _pids_on_port(port)
            if pids:
                pid_file.write_text(str(pids[0]))
                print(f"  {name} already running on port {port} (PID {pids[0]}) — adopted.")
            else:
                print(f"  {name} port {port} already in use — skipping.")
            return
        print(f"  Starting {name}…")
        proc = subprocess.Popen(
            cmd,
            cwd=self.root,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        pid_file.write_text(str(proc.pid))
        _wait_for_port(port, name)

    def start(self, args: list[str]) -> None:
        dotenv = _env_with_dotenv(self.root / ".env")
        print("==> Starting development servers…")
        self._start_service(
            "API",
            ["npm", "--workspace", "apps/api", "run", "dev"],
            self.api_pid,
            3000,
        )
        self._start_service(
            "Frontend",
            ["npm", "--workspace", "apps/web", "run", "dev"],
            self.web_pid,
            3001,
        )
        # AI service has its own daemon mechanism; pass .env vars explicitly
        print("  Starting AI service…")
        subprocess.run(
            [sys.executable, "-m", "mycologs_ai_service", "--daemon"],
            cwd=self.root / "ai-service",
            env=dotenv,
        )
        _wait_for_port(3002, "AI service")
        print()
        print("  API        → http://localhost:3000")
        print("  Frontend   → http://localhost:3001")
        print("  AI service → http://localhost:3002")

    def stop(self, args: list[str]) -> None:
        dotenv = _env_with_dotenv(self.root / ".env")
        print("==> Stopping development servers…")
        _stop_service("API", self.api_pid, 3000)
        _stop_service("Frontend", self.web_pid, 3001)
        subprocess.run(
            [sys.executable, "-m", "mycologs_ai_service", "--stop"],
            cwd=self.root / "ai-service",
            env=dotenv,
        )
        # Kill any remaining process on the AI service port
        for pid in _pids_on_port(3002):
            if _pid_alive(pid):
                print(f"  Killing AI service on port 3002 (PID {pid})…")
                _kill_pid(pid)
        print("    Done.")

    def restart(self, args: list[str]) -> None:
        self.stop(args)
        print()
        self.start(args)

    def _service_status(self, name: str, pid_file: Path, port: int) -> None:
        pid = _read_pid(pid_file)
        if pid and _pid_alive(pid):
            print(f"  {name:<12} RUNNING (PID {pid})")
            return
        pids = _pids_on_port(port)
        if pids:
            print(f"  {name:<12} RUNNING on port {port} (PID {pids[0]}, unmanaged)")
        else:
            print(f"  {name:<12} STOPPED")

    def status(self, args: list[str]) -> None:
        dotenv = _env_with_dotenv(self.root / ".env")
        print("==> Development server status:")
        self._service_status("API", self.api_pid, 3000)
        self._service_status("Frontend", self.web_pid, 3001)
        subprocess.run(
            [sys.executable, "-m", "mycologs_ai_service", "--status"],
            cwd=self.root / "ai-service",
            env=dotenv,
        )

    def _npm_run(self, script: str, extra: list[str]) -> None:
        cmd = ["npm", "run", script]
        if extra:
            cmd += ["--"] + extra
        _run(cmd, cwd=self.root)

    def seed_taxonomy(self, args: list[str]) -> None:
        print("Running taxonomy seed…")
        self._npm_run("seed-taxonomy", args)

    def seed_admin(self, args: list[str]) -> None:
        print("Creating admin user…")
        self._npm_run("seed-admin-user", args)

    def make_test_user(self, args: list[str]) -> None:
        print("Creating test clubs and users from testdata.csv…")
        self._npm_run("make-test-user", args)

    def set_user_role(self, args: list[str]) -> None:
        if len(args) < 2:
            print("Usage: mycologs set-user-role <email> <ADMIN|DEVELOPER|MODERATOR|null>",
                  file=sys.stderr)
            sys.exit(1)
        self._npm_run("set-user-role", args)

    def add_user(self, args: list[str]) -> None:
        if not args:
            print("Usage: mycologs add-user <name> [ADMIN|DEVELOPER|MODERATOR]",
                  file=sys.stderr)
            sys.exit(1)
        self._npm_run("add-user", args)

    def list_user(self, args: list[str]) -> None:
        self._npm_run("list-user", args)


DEV_COMMANDS = {
    "start":         DevMode.start,
    "stop":          DevMode.stop,
    "restart":       DevMode.restart,
    "status":        DevMode.status,
    "seed-taxonomy": DevMode.seed_taxonomy,
    "seed-admin":    DevMode.seed_admin,
    "make-test-user":DevMode.make_test_user,
    "set-user-role": DevMode.set_user_role,
    "add-user":      DevMode.add_user,
    "list-user":     DevMode.list_user,
}

DEV_USAGE = (
    "  mycologs {start|stop|restart|status|\n"
    "            seed-taxonomy|seed-admin|make-test-user|\n"
    "            set-user-role <email> <role>|\n"
    "            add-user <name> [role]|list-user}"
)


# ---------------------------------------------------------------------------
# Sandbox mode
# ---------------------------------------------------------------------------

class SandboxMode:
    def __init__(self, sandbox_dir: Path) -> None:
        self.dir = sandbox_dir

    def _compose(self, args: list[str], check: bool = True) -> int:
        return _run(["docker", "compose"] + args, cwd=self.dir, check=check)

    def start(self, args: list[str]) -> None:
        (self.dir / "pgdata").mkdir(exist_ok=True)
        (self.dir / "uploads").mkdir(exist_ok=True)
        print("Starting sandbox…")
        self._compose(["up", "-d"])
        print()
        self._compose(["ps"], check=False)
        print()
        print("  API → http://localhost:4000")
        print("  Web → http://localhost:4001")

    def stop(self, args: list[str]) -> None:
        print("Stopping sandbox…")
        self._compose(["down"])

    def restart(self, args: list[str]) -> None:
        self.stop(args)
        self.start(args)

    def status(self, args: list[str]) -> None:
        self._compose(["ps"], check=False)

    def logs(self, args: list[str]) -> None:
        service = args[0] if args else None
        cmd = ["logs", "-f", "-t"]
        if service:
            cmd.append(service)
        self._compose(cmd, check=False)

    def build(self, args: list[str]) -> None:
        print("Building all images…")
        self._compose(["build"])

    def seed_taxonomy(self, args: list[str]) -> None:
        print("Running taxonomy seed…")
        self._compose(["exec", "api", "npx", "ts-node", "scripts/seed-taxonomy.ts"])

    def seed_admin(self, args: list[str]) -> None:
        print("Creating admin user…")
        self._compose(["exec", "api", "npx", "ts-node", "scripts/seed-admin-user.ts"])

    def make_test_user(self, args: list[str]) -> None:
        print("Creating test clubs and users from testdata.csv…")
        self._compose(["exec", "api", "npx", "ts-node", "scripts/make-test-user.ts"])

    def set_user_role(self, args: list[str]) -> None:
        if len(args) < 2:
            print("Usage: mycologs set-user-role <email> <ADMIN|DEVELOPER|MODERATOR|null>",
                  file=sys.stderr)
            sys.exit(1)
        self._compose(["exec", "api", "npx", "ts-node", "scripts/set-user-role.ts"] + args)

    def add_user(self, args: list[str]) -> None:
        if not args:
            print("Usage: mycologs add-user <name> [ADMIN|DEVELOPER|MODERATOR]",
                  file=sys.stderr)
            sys.exit(1)
        self._compose(["exec", "api", "npx", "ts-node", "scripts/add-user.ts"] + args)

    def list_user(self, args: list[str]) -> None:
        self._compose(["exec", "api", "npx", "ts-node", "scripts/list-user.ts"])


SANDBOX_COMMANDS: dict[str, tuple[object, str]] = {
    "start":         (SandboxMode.start,          ""),
    "stop":          (SandboxMode.stop,            ""),
    "restart":       (SandboxMode.restart,         ""),
    "status":        (SandboxMode.status,          ""),
    "logs":          (SandboxMode.logs,            "[service]"),
    "build":         (SandboxMode.build,           ""),
    "seed-taxonomy": (SandboxMode.seed_taxonomy,   ""),
    "seed-admin":    (SandboxMode.seed_admin,      ""),
    "make-test-user":(SandboxMode.make_test_user,  ""),
    "set-user-role": (SandboxMode.set_user_role,   "<email> <role>"),
    "add-user":      (SandboxMode.add_user,        "<name> [role]"),
    "list-user":     (SandboxMode.list_user,       ""),
}

SANDBOX_USAGE = (
    "  mycologs {start|stop|restart|status|logs|build|\n"
    "            seed-taxonomy|seed-admin|make-test-user|\n"
    "            set-user-role <email> <role>|\n"
    "            add-user <name> [role]|list-user} [args…]"
)


# ---------------------------------------------------------------------------
# Environment detection
# ---------------------------------------------------------------------------

def _detect_env(cwd: Path) -> tuple[str, Path]:
    """Return (env_name, project_root)."""
    dotenv = _load_dotenv(cwd / ".env")
    mycologs_env = dotenv.get("MYCOLOGS_ENV", "").lower()

    if mycologs_env == "sandbox":
        return "sandbox", cwd
    if mycologs_env == "development":
        return "development", cwd

    # Fallback: if docker-compose.yml present, assume sandbox
    if (cwd / "docker-compose.yml").exists():
        return "sandbox", cwd

    # Default to development
    return "development", cwd


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _usage_and_exit(env: str, extra: str = "") -> None:
    if extra:
        print(f"Error: {extra}", file=sys.stderr)
    if env == "sandbox":
        print(f"Usage (sandbox):\n{SANDBOX_USAGE}", file=sys.stderr)
    else:
        print(f"Usage (development):\n{DEV_USAGE}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    cwd = Path.cwd()
    env, base_dir = _detect_env(cwd)

    argv = sys.argv[1:]
    if not argv:
        _usage_and_exit(env)

    cmd_name = argv[0]
    rest = argv[1:]

    if env == "development":
        root = base_dir
        # If we're inside a subdirectory, walk up to find the repo root
        # (look for package.json with workspaces)
        candidate = root
        while candidate != candidate.parent:
            if (candidate / "package.json").exists() and (candidate / "apps").exists():
                root = candidate
                break
            candidate = candidate.parent

        mode = DevMode(root)
        fn = DEV_COMMANDS.get(cmd_name)
        if fn is None:
            _usage_and_exit(env, f"Unknown command '{cmd_name}'")
        fn(mode, rest)

    else:  # sandbox
        mode = SandboxMode(base_dir)
        entry = SANDBOX_COMMANDS.get(cmd_name)
        if entry is None:
            _usage_and_exit(env, f"Unknown command '{cmd_name}'")
        fn, _ = entry
        fn(mode, rest)


if __name__ == "__main__":
    main()
