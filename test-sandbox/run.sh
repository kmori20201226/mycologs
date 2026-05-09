#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE="docker compose"

usage() {
  echo "Usage: $0 {start|stop|restart|status|logs|migrate|seed-taxonomy|seed-admin|make-test-user|build|psql|maintenance}"
  echo ""
  echo "  start            Start all containers and apply any pending migrations"
  echo "  stop             Stop all containers"
  echo "  restart          Stop then start"
  echo "  status           Show container status"
  echo "  logs             Tail logs (all services, or pass a service name)"
  echo "  migrate          Apply pending Prisma migrations inside the running api container"
  echo "  build            Rebuild all images and apply migrations (use after schema changes)"
  echo "  seed-plans       Upsert default subscription plans"
  echo "  seed-taxonomy    Run the taxonomy seed inside the api container"
  echo "  seed-admin       Create the admin@localhost user inside the api container"
  echo "  make-test-user   Create clubs and users from testdata.csv"
  echo "  psql             Open a psql session in the postgres container"
  echo "  maintenance on   Enable maintenance mode (non-admin login blocked)"
  echo "  maintenance off  Disable maintenance mode"
  echo "  stripe-test      Run Stripe round trip test (test keys only)"
  exit 1
}

cmd_start() {
  mkdir -p pgdata uploads
  echo "Starting sandbox..."
  $COMPOSE up -d
  echo "Waiting for api to be ready..."
  $COMPOSE exec api sh -c 'until npx prisma migrate deploy 2>/dev/null; do sleep 2; done'
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

cmd_seed_plans() {
  echo "Fetching prices from Stripe (test mode)..."
  local key
  key=$(grep '^STRIPE_SECRET_KEY=' .env 2>/dev/null | cut -d= -f2-)
  if [ -z "$key" ]; then echo "Error: STRIPE_SECRET_KEY not set in .env"; exit 1; fi
  local prices
  prices=$(stripe prices list --limit 20 --expand data.product --api-key "$key" -o json)
  $COMPOSE exec -e STRIPE_PRICES_JSON="$prices" api npx ts-node scripts/seed-plans-stripe.ts
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

cmd_migrate() {
  echo "Running Prisma migrations..."
  $COMPOSE exec api npx prisma migrate deploy
}

cmd_build() {
  echo "Building all images..."
  $COMPOSE build
  echo "Restarting api and running migrations..."
  $COMPOSE up -d api
  $COMPOSE exec api npx prisma migrate deploy
}

cmd_psql() {
  $COMPOSE exec postgres psql -U postgres mycologs
}

cmd_maintenance() {
  local mode="${2:-}"
  case "$mode" in
    on)
      $COMPOSE exec postgres psql -U postgres mycologs -c \
        "INSERT INTO site_settings (key, value, updated_at) VALUES ('maintenanceMode', 'true', NOW()) ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW();"
      echo "Maintenance mode ON — non-admin login is now blocked."
      ;;
    off)
      $COMPOSE exec postgres psql -U postgres mycologs -c \
        "INSERT INTO site_settings (key, value, updated_at) VALUES ('maintenanceMode', 'false', NOW()) ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW();"
      echo "Maintenance mode OFF — login restored."
      ;;
    *)
      echo "Usage: $0 maintenance {on|off}"
      exit 1
      ;;
  esac
}

case "${1:-}" in
  start)        cmd_start ;;
  stop)         cmd_stop ;;
  restart)      cmd_restart ;;
  status)       cmd_status ;;
  logs)         cmd_logs "$@" ;;
  migrate)          cmd_migrate ;;
  seed-plans)       cmd_seed_plans ;;
  seed-taxonomy) cmd_seed ;;
  seed-admin)      cmd_seed_admin ;;
  make-test-user)  cmd_make_test_user ;;
  build)           cmd_build ;;
  psql)            cmd_psql ;;
  maintenance)     cmd_maintenance "$@" ;;
  stripe-test)     $COMPOSE exec api npx ts-node scripts/stripe-roundtrip.ts ;;
  *)               usage ;;
esac
