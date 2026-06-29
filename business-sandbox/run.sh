#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE="docker compose"

usage() {
  echo "Usage: $0 {start|stop|restart|status|logs|migrate|seed-plans|seed-taxonomy|seed-admin|build|build-export|deploy|load|psql|maintenance|list-user|buy-credit|backup-posts|restore-posts}"
  echo ""
  echo "  start            Start all containers and apply any pending migrations"
  echo "  stop             Stop all containers"
  echo "  restart          Stop then start"
  echo "  status           Show container status"
  echo "  logs             Tail logs (all services, or pass a service name)"
  echo "  migrate          Apply pending Prisma migrations inside the running api container"
  echo "  build            Rebuild all images and apply migrations (use after schema changes)"
  echo "  build-export     (dev machine) Build images + save a versioned tarball to ./dist/ for transfer"
  echo "  deploy           (dev machine) build-export + scp to the business server + remote load & start"
  echo "  load <file>      (business machine) Load images from a ./dist tarball, then run 'start' (no rebuild)"
  echo "  seed-plans       Upsert default subscription plans"
  echo "  seed-taxonomy    Run the taxonomy seed inside the api container"
  echo "  seed-admin       Create the admin user inside the api container"
  echo "  psql             Open a psql session in the postgres container"
  echo "  maintenance on   Enable maintenance mode (non-admin login blocked)"
  echo "  maintenance off  Disable maintenance mode"
  echo "  list-user        List all users (id and email)"
  echo "  buy-credit <email|user-id|club:ID> [amount]  Add credit (default 1000) and keep a fake subscription active for 1 month"
  echo "  backup-posts [filter]  Export posts/media/identifications to ./backups/ (filter: e.g. 1-9,12,18)"
  echo "  restore-posts <file>   Restore from a backup file in ./backups/"
  exit 1
}

cmd_start() {
  mkdir -p pgdata uploads
  echo "Starting business environment..."
  $COMPOSE up -d
  echo "Waiting for api to be ready..."
  $COMPOSE exec api sh -c 'until npx prisma migrate deploy 2>/dev/null; do sleep 2; done'
  echo ""
  $COMPOSE ps
  echo ""
  echo "  API → http://localhost:3000"
  echo "  Web → http://localhost:3001"
  echo "  DB  → localhost:5432"
}

cmd_stop() {
  echo "Stopping business environment..."
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

cmd_migrate() {
  echo "Running Prisma migrations..."
  $COMPOSE exec api npx prisma migrate deploy
}

cmd_seed_plans() {
  echo "Seeding plans from Stripe (live mode)..."
  $COMPOSE exec api npx ts-node scripts/seed-plans-stripe.ts
}

cmd_seed_taxonomy() {
  echo "Running taxonomy seed..."
  $COMPOSE exec api npx ts-node scripts/seed-taxonomy.ts
}

cmd_seed_admin() {
  echo "Creating admin user..."
  $COMPOSE exec api npx ts-node scripts/seed-admin-user.ts
}

cmd_build() {
  export GIT_HASH=$(git -C .. rev-parse --short HEAD 2>/dev/null || echo "unknown")
  export GIT_BRANCH=$(git -C .. rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  echo "Building all images... ($GIT_BRANCH@$GIT_HASH)"
  $COMPOSE build
  echo "Restarting services and running migrations..."
  $COMPOSE up -d api web ai-service
  $COMPOSE exec api npx prisma migrate deploy
}

# Built image names: compose has no `image:` keys, so it names them
# <project>-<service>, and the project is `mycologs-business` (see compose `name:`).
BUILT_IMAGES="mycologs-business-api mycologs-business-web mycologs-business-ai-service"

# Business server, reachable over key-based ssh. Override via env if it changes.
REMOTE_HOST="${MYCOLOGS_HOST:-mycologs}"
REMOTE_DIR="${MYCOLOGS_DIR:-mycologs/business-sandbox}"  # relative to the remote home dir

# Public app version drives the tarball name — single source of truth is the web package.
pkg_version()  { grep -m1 '"version"' ../apps/web/package.json | sed -E 's/.*"version" *: *"([^"]+)".*/\1/'; }
git_hash()     { git -C .. rev-parse --short HEAD 2>/dev/null || echo "unknown"; }
# e.g. dist/mycologs-images-v1.4.5-e01dd42.tar.gz  (version for humans, hash for uniqueness)
tarball_path() { echo "dist/mycologs-images-v$(pkg_version)-$(git_hash).tar.gz"; }
# Format a duration in seconds as e.g. "3m07s".
fmt_dur() { local s=$1; printf '%dm%02ds' $((s / 60)) $((s % 60)); }

# (dev machine) Build the images here, then save them to a versioned tarball so a
# memory-starved business server can just `load` + `start` instead of building.
# Build args (notably NEXT_PUBLIC_API_URL) come from .env, same as `build`.
cmd_build_export() {
  if ! grep -q '^NEXT_PUBLIC_API_URL=' .env 2>/dev/null; then
    echo "WARNING: NEXT_PUBLIC_API_URL not found in .env — the web bundle will default to /api."
    echo "         The image bakes this at build time; set it before exporting for production."
  fi
  mkdir -p dist
  export GIT_HASH=$(git_hash)
  export GIT_BRANCH=$(git -C .. rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  local out base; out="$(tarball_path)"; base="$(basename "$out")"
  echo "Building images for transfer... (v$(pkg_version) $GIT_BRANCH@$GIT_HASH, $(uname -m))"
  local t0=$SECONDS
  $COMPOSE build api web ai-service
  local build_secs=$((SECONDS - t0))
  echo "Saving images to $out ..."
  docker save $BUILT_IMAGES | gzip > "$out"
  local total_secs=$((SECONDS - t0))
  echo ""
  echo "  Done: $out ($(du -h "$out" | cut -f1), built on $(uname -m); server must also be x86_64)"
  echo "  Time: build $(fmt_dur $build_secs), save $(fmt_dur $((total_secs - build_secs))), total $(fmt_dur $total_secs)"
  echo "  Ship it in one step:  ./run.sh deploy"
  echo "  Or manually:  scp $out $REMOTE_HOST:$REMOTE_DIR/dist/ && ssh $REMOTE_HOST \"cd $REMOTE_DIR && ./run.sh load dist/$base && ./run.sh start\""
}

# (dev machine) One-command release: build + save, copy to the business server,
# then load + start there over ssh. Requires the server's run.sh to already have
# the `load` command (git pull on the server) and a matching x86_64 arch.
cmd_deploy() {
  local d0=$SECONDS
  cmd_build_export
  local out base; out="$(tarball_path)"; base="$(basename "$out")"
  echo ""
  echo "Transferring $base -> $REMOTE_HOST:$REMOTE_DIR/dist/ ..."
  local x0=$SECONDS
  ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_DIR/dist'"
  scp "$out" "$REMOTE_HOST:$REMOTE_DIR/dist/"
  echo "Loading + starting on $REMOTE_HOST ..."
  ssh "$REMOTE_HOST" "cd '$REMOTE_DIR' && ./run.sh load 'dist/$base' && ./run.sh start"
  echo ""
  echo "Deployed v$(pkg_version) ($(git_hash)) to $REMOTE_HOST in $(fmt_dur $((SECONDS - d0))) (transfer+remote $(fmt_dur $((SECONDS - x0))))."
}

# (business machine) Load images produced by build-export. Afterwards `start`
# uses them as-is — compose only builds when an image is missing.
cmd_load() {
  local file="${2:-}"
  if [ -z "$file" ]; then echo "Usage: $0 load <image-tarball.tar.gz>"; exit 1; fi
  if [ ! -f "$file" ]; then echo "File not found: $file"; exit 1; fi
  echo "Loading images from $file ..."
  gunzip -c "$file" | docker load
  echo ""
  echo "Loaded. Start with the loaded images (no rebuild):"
  echo "  ./run.sh start"
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
  start)         cmd_start ;;
  stop)          cmd_stop ;;
  restart)       cmd_restart ;;
  status)        cmd_status ;;
  logs)          cmd_logs "$@" ;;
  migrate)       cmd_migrate ;;
  seed-plans)    cmd_seed_plans ;;
  seed-taxonomy) cmd_seed_taxonomy ;;
  seed-admin)    cmd_seed_admin ;;
  build)         cmd_build ;;
  build-export)  cmd_build_export ;;
  deploy)        cmd_deploy ;;
  load)          cmd_load "$@" ;;
  psql)          cmd_psql ;;
  maintenance)   cmd_maintenance "$@" ;;
  list-user)     $COMPOSE exec api npx ts-node scripts/list-user.ts ;;
  buy-credit)
    shift
    if [ -z "${1:-}" ]; then echo "Usage: $0 buy-credit <email|user-id|club:ID> [amount]"; exit 1; fi
    $COMPOSE exec api npx ts-node scripts/buy-credit.ts "$@" ;;
  backup-posts)  mkdir -p backups && $COMPOSE exec api npx ts-node scripts/backup-posts.ts "${2:-}" ;;
  restore-posts)
    if [ -z "${2:-}" ]; then echo "Usage: $0 restore-posts <filename>"; exit 1; fi
    $COMPOSE exec api npx ts-node scripts/restore-posts.ts /app/backups/"$2" ;;
  *)             usage ;;
esac
