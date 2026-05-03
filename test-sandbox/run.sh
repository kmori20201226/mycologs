#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE="docker compose"

usage() {
  echo "Usage: $0 {start|stop|restart|status|logs|seed-taxonomy|seed-admin|make-test-user|build|psql}"
  echo ""
  echo "  start          Build (if needed) and start all containers"
  echo "  stop           Stop all containers"
  echo "  restart        Stop then start"
  echo "  status         Show container status"
  echo "  logs           Tail logs (all services, or pass a service name)"
  echo "  seed-taxonomy  Run the taxonomy seed inside the api container"
  echo "  seed-admin     Create the admin@localhost user inside the api container"
  echo "  make-test-user Create clubs and users from testdata.csv"
  echo "  build          Force-rebuild all images"
  echo "  psql           Open a psql session in the postgres container"
  exit 1
}

cmd_start() {
  # PostgreSQL 18 requires the mount at /var/lib/postgresql (not /data).
  # Pre-create the directory so Docker doesn't create it as root.
  mkdir -p pgdata uploads
  echo "Starting sandbox..."
  $COMPOSE up -d
  echo ""
  $COMPOSE ps
  echo ""
  echo "  API → http://localhost:4000"
  echo "  Web → http://localhost:4001"
}

cmd_stop() {
  echo "Stopping sandbox..."
  $COMPOSE down
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_status() {
  $COMPOSE ps
}

cmd_logs() {
  local service="${2:-}"
  if [ -n "$service" ]; then
    $COMPOSE logs -f -t "$service"
  else
    $COMPOSE logs -f -t
  fi
}

cmd_seed() {
  echo "Running seed script..."
  $COMPOSE exec api npx ts-node scripts/seed-taxonomy.ts
}

cmd_seed_admin() {
  echo "Creating admin user..."
  $COMPOSE exec api npx ts-node scripts/seed-admin-user.ts
}

cmd_make_test_user() {
  echo "Creating test clubs and users from testdata.csv..."
  $COMPOSE exec api npx ts-node scripts/make-test-user.ts
}

cmd_build() {
  echo "Building all images..."
  $COMPOSE build
}

cmd_psql() {
  $COMPOSE exec postgres psql -U postgres mycologs
}

case "${1:-}" in
  start)        cmd_start ;;
  stop)         cmd_stop ;;
  restart)      cmd_restart ;;
  status)       cmd_status ;;
  logs)         cmd_logs "$@" ;;
  seed-taxonomy) cmd_seed ;;
  seed-admin)      cmd_seed_admin ;;
  make-test-user)  cmd_make_test_user ;;
  build)           cmd_build ;;
  psql)            cmd_psql ;;
  *)            usage ;;
esac
