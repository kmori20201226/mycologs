#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE="docker compose"

usage() {
  echo "Usage: $0 {start|stop|restart|status|logs|migrate|seed-plans|seed-taxonomy|seed-admin|build|build-export|deploy|load|psql|maintenance|list-user|buy-credit|backup-full|restore-full|backup-posts|restore-posts}"
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
  echo "  backup-full            FULL disaster-recovery backup (db + uploads + .env) to ./backups/"
  echo "  restore-full <file>    Rebuild this server from a backup-full archive (destructive)"
  echo "  backup-posts [filter]  Export posts/media/identifications only — for moving content"
  echo "                         between systems, NOT a disaster-recovery backup (filter: 1-9,12,18)"
  echo "  restore-posts <file>   Restore from a backup-posts file in ./backups/"
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

# ---------------------------------------------------------------------------
# Full disaster-recovery backup / restore
# ---------------------------------------------------------------------------
# NOT the same thing as backup-posts. That one is a portability tool: it carries
# posts, media and identifications only, and drops users, taxonomy, votes, clubs,
# events, post coordinates and post visibility (restored posts default to PUBLIC).
# Restoring a crashed server from it would lose most of the site.
#
# A real restore needs three things, so all three go in the archive:
#   db.dump          logical pg_dump — re-read through the server, so unlike a
#                    copy of pgdata/ it cannot carry WAL corruption forward
#   uploads.tar.gz   ./uploads — media files live on disk, not in the database
#   env              ./.env — JWT_SECRET, Stripe/LINE/Resend secrets; without it
#                    nobody can log in after a rebuild
#
# The archive therefore contains live OAuth tokens, password hashes and API keys.
# It is written 0600. Keep it that way wherever you pull it to.
BACKUP_KEEP="${MYCOLOGS_BACKUP_KEEP:-7}"

cmd_backup_full() {
  mkdir -p backups uploads
  local ts name stage out
  ts="$(date +%Y%m%dT%H%M%S)"
  name="mycologs-full-$ts"
  stage="backups/.stage-$name"
  out="backups/$name.tar"
  rm -rf "$stage"; mkdir -p "$stage"
  # Expand $stage now, not at trap time — it is function-local and would be out
  # of scope (and fatal under `set -u`) once the EXIT trap actually runs.
  trap "rm -rf '$stage'" EXIT

  echo "[1/5] Dumping database..."
  # -T is required: without it compose allocates a TTY and mangles binary stdout.
  $COMPOSE exec -T postgres pg_dump -U postgres -Fc mycologs > "$stage/db.dump"

  echo "[2/5] Verifying the dump is readable..."
  # Read it back through pg_restore. A dump that cannot be listed cannot be
  # restored, and it is far better to find that out now than during an outage.
  $COMPOSE exec -T postgres pg_restore --list < "$stage/db.dump" > "$stage/db.toc.txt"
  local entries; entries="$(grep -c '^[0-9]' "$stage/db.toc.txt" || true)"
  if [ "${entries:-0}" -lt 1 ]; then
    echo "ERROR: dump verification failed — no restorable entries found." >&2
    exit 1
  fi
  echo "       ok ($entries restorable entries)"

  echo "[3/5] Archiving uploads..."
  tar -czf "$stage/uploads.tar.gz" uploads

  echo "[4/5] Capturing .env and manifest..."
  if [ -f .env ]; then
    cp .env "$stage/env"
  else
    echo "       WARNING: no .env found — this backup will NOT be restorable on its own."
  fi
  {
    echo "created:     $(date -Is)"
    echo "host:        $(hostname)"
    echo "app_version: $(pkg_version)"
    echo "git:         $(git -C .. rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)@$(git_hash)"
    echo "uploads:     $(find uploads -type f | wc -l) files"
    echo "toc_entries: $entries"
    echo "row_counts:"
    $COMPOSE exec -T postgres psql -U postgres -d mycologs -At -c \
      "SELECT format('  %s = %s', t, n) FROM (
         SELECT 'users' t, count(*) n FROM users UNION ALL
         SELECT 'posts', count(*) FROM posts UNION ALL
         SELECT 'media', count(*) FROM media UNION ALL
         SELECT 'identifications', count(*) FROM identifications UNION ALL
         SELECT 'votes', count(*) FROM votes UNION ALL
         SELECT 'species', count(*) FROM species
       ) s ORDER BY 1;"
  } > "$stage/MANIFEST.txt"

  echo "[5/5] Bundling..."
  # Plain tar, not tar.gz: db.dump (-Fc) and uploads.tar.gz are already compressed.
  tar -cf "$out" -C "$stage" .
  chmod 600 "$out"
  ( cd backups && sha256sum "$name.tar" > "$name.tar.sha256" )
  ln -sfn "$name.tar" backups/latest.tar

  # Retention: keep the newest $BACKUP_KEEP full backups, drop older ones.
  local old
  old="$(ls -1t backups/mycologs-full-*.tar 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) || true)"
  if [ -n "$old" ]; then
    echo ""
    echo "Pruning to the newest $BACKUP_KEEP backups:"
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      echo "  removing $(basename "$f")"
      rm -f "$f" "$f.sha256"
    done <<< "$old"
  fi

  echo ""
  cat "$stage/MANIFEST.txt" | sed 's/^/  /'
  echo ""
  echo "  Backup: $out ($(du -h "$out" | cut -f1))"
  echo "  Also:   backups/latest.tar -> $name.tar"
  echo ""
  echo "  Pull it from your dev machine with:"
  echo "    scp $REMOTE_HOST:$REMOTE_DIR/backups/$name.tar ."
  echo "    sha256sum -c $name.tar.sha256   # after also copying the .sha256"
}

cmd_restore_full() {
  local file="${2:-}"
  if [ -z "$file" ]; then echo "Usage: $0 restore-full <backups/mycologs-full-....tar>"; exit 1; fi
  if [ ! -f "$file" ]; then echo "File not found: $file"; exit 1; fi

  local stage; stage="backups/.restore-$(date +%s)"
  mkdir -p "$stage"
  trap "rm -rf '$stage'" EXIT
  tar -xf "$file" -C "$stage"
  if [ ! -f "$stage/db.dump" ]; then
    echo "ERROR: $file does not look like a full backup (no db.dump inside)." >&2
    exit 1
  fi

  echo "About to restore from:"
  sed 's/^/  /' "$stage/MANIFEST.txt" 2>/dev/null || true
  echo ""
  echo "This DROPS the current 'mycologs' database and replaces ./uploads."
  echo "Enable maintenance mode first (./run.sh maintenance on) so the API is not"
  echo "writing during the restore. Do NOT 'docker stop' on this host."
  echo ""
  read -r -p "Type RESTORE to continue: " confirm
  [ "$confirm" = "RESTORE" ] || { echo "Aborted."; exit 1; }

  echo "[1/3] Recreating the database..."
  $COMPOSE exec -T postgres psql -U postgres -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = 'mycologs' AND pid <> pg_backend_pid();" > /dev/null
  $COMPOSE exec -T postgres psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS mycologs;"
  $COMPOSE exec -T postgres psql -U postgres -d postgres -c "CREATE DATABASE mycologs OWNER postgres;"

  echo "[2/3] Restoring the dump..."
  $COMPOSE exec -T postgres pg_restore -U postgres -d mycologs --no-owner < "$stage/db.dump"

  echo "[3/3] Restoring uploads..."
  # Keep whatever is currently there until the new copy is safely in place.
  if [ -d uploads ]; then mv uploads "uploads.pre-restore-$(date +%s)"; fi
  tar -xzf "$stage/uploads.tar.gz" -C .

  echo ""
  echo "Database and uploads restored."
  if [ -f "$stage/env" ]; then
    cp "$stage/env" "backups/env.from-backup"
    chmod 600 backups/env.from-backup
    echo "The backup's .env was NOT applied automatically — compare it yourself:"
    echo "    diff .env backups/env.from-backup"
  fi
  echo "Then: ./run.sh start && ./run.sh maintenance off"
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
  backup-full)   cmd_backup_full ;;
  restore-full)  cmd_restore_full "$@" ;;
  backup-posts)  mkdir -p backups && $COMPOSE exec api npx ts-node scripts/backup-posts.ts "${2:-}" ;;
  restore-posts)
    if [ -z "${2:-}" ]; then echo "Usage: $0 restore-posts <filename>"; exit 1; fi
    $COMPOSE exec api npx ts-node scripts/restore-posts.ts /app/backups/"$2" ;;
  *)             usage ;;
esac
