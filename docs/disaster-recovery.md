# Disaster recovery

How to back up the business server, how to bring it back after a crash, and how
to repair the database when the crash left damage behind.

## Which backup command is which

| Command | What it is |
|---|---|
| `./run.sh backup-full` | **The disaster-recovery backup.** Database + uploads + `.env`. Use this. |
| `./run.sh backup-posts` | A *portability* tool for moving content between systems. **Not** a restore path. |

`backup-posts` exports posts, media and identifications only. It omits users,
taxonomy, votes, clubs, events, subscriptions and payments, and per-post it omits
`latitude`, `longitude` and `visibility` — so posts restored from it come back
with no coordinates and `visibility = PUBLIC`, the schema default. Restoring a
crashed server from a `backup-posts` archive would lose most of the site and
would publish every previously PRIVATE post. Don't reach for it in an outage.

## Taking a backup

Run on the business server, from `business-sandbox/`:

```bash
./run.sh backup-full
```

This produces `backups/mycologs-full-<timestamp>.tar` (mode 0600), a matching
`.sha256`, and a `backups/latest.tar` symlink. The archive contains:

| Entry | Why it's needed |
|---|---|
| `db.dump` | `pg_dump -Fc`. A *logical* dump — rows are re-read through the server, so unlike a copy of `pgdata/` it cannot carry WAL or data-file corruption forward. |
| `uploads.tar.gz` | Media files live on disk, not in the database. Without these the restored site is all broken images. |
| `env` | `JWT_SECRET`, Stripe/LINE/Resend secrets. Rebuild without it and nobody can log in and billing breaks. |
| `MANIFEST.txt` | Timestamp, app version, git hash, upload count, row counts. |
| `db.toc.txt` | The table of contents (see the limitation below). |

Retention defaults to the newest 7 archives. Override with
`MYCOLOGS_BACKUP_KEEP=14 ./run.sh backup-full`.

### What the built-in check does and does not prove

`backup-full` reads the dump back through `pg_restore --list` and fails if it
yields no restorable entries. **That proves the archive is readable. It does not
prove it will restore.** Listing a dump never builds constraints, so a dump
carrying duplicate primary keys lists perfectly and then fails on restore.

This is not hypothetical. On 2026-08-27 a crash left two visible heap tuples for
one `posts` row; every `backup-full` after that verified "clean" while being
unrestorable. It was caught only by an actual test restore, described next.

### Take one before every upgrade

Run `backup-full` and confirm `ok (N restorable entries)` *before* starting any
deploy or migration.

## Pulling it to another machine

The archive holds live OAuth access/refresh tokens, every password hash, and all
API keys. Keep it 0600 and keep it off the internet.

```bash
scp mycologs:mycologs/business-sandbox/backups/mycologs-full-<ts>.tar .
scp mycologs:mycologs/business-sandbox/backups/mycologs-full-<ts>.tar.sha256 .
sha256sum -c mycologs-full-<ts>.tar.sha256
```

A backup that only exists on the business VM does not survive that VM dying.
Pull regularly. `/business-full-backup/` and `mycologs-full-*.tar` are
gitignored, so a pulled archive can't be committed by accident.

## Rehearsing a restore — do this, it is the only real verification

Restore into a scratch database on a machine that is not production, then check
it. This is what catches problems the built-in check cannot.

```bash
tar -xOf mycologs-full-<ts>.tar ./db.dump > /tmp/rehearse.dump
docker exec -i mycologs-postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS mycologs_rehearsal;" \
  -c "CREATE DATABASE mycologs_rehearsal OWNER postgres;"
docker exec -i mycologs-postgres pg_restore -U postgres -d mycologs_rehearsal \
  --no-owner < /tmp/rehearse.dump
echo "exit: $?"
```

Then confirm three things:

1. **`pg_restore` exited 0 with no error output.** Errors about a unique index
   mean duplicate rows; errors about "no unique constraint matching given keys"
   are the foreign keys cascading off that failure.
2. **Row counts match `MANIFEST.txt`.**
3. **`pg_amcheck` is silent:**
   ```bash
   docker exec -i mycologs-postgres psql -U postgres -d mycologs_rehearsal \
     -c "CREATE EXTENSION IF NOT EXISTS amcheck;"
   docker exec -i mycologs-postgres pg_amcheck --username=postgres \
     --heapallindexed --database=mycologs_rehearsal --progress
   ```

Drop the scratch database when done.

## Restoring after a total loss

```bash
./run.sh maintenance on
./run.sh restore-full backups/mycologs-full-<ts>.tar
./run.sh start
./run.sh maintenance off
```

`restore-full` prints the manifest, requires you to type `RESTORE`, then drops
and recreates the `mycologs` database, restores the dump, and replaces
`uploads/` — keeping the previous directory as `uploads.pre-restore-<epoch>`.

Use `maintenance on` rather than stopping containers. On this host `docker stop`
hits the snap/AppArmor permission trap; the restore never needs it.

The backup's `.env` is deliberately **not** applied automatically — it is written
to `backups/env.from-backup` for you to diff:

```bash
diff .env backups/env.from-backup
```

Restoring onto a *fresh* machine also needs: the repo, the image tarball
(`./run.sh load dist/<tarball>`), and that `.env` in place before `start`.

---

# Repairing a corrupted database

Symptoms: `pg_dump` fails partway, `pg_restore` of a fresh dump reports duplicate
keys, or `pg_amcheck` reports anything at all. Cause is usually an unclean
shutdown — see `docs/`-adjacent history for the 2026-08-27 incident, which
followed an OOM kill and a forced reboot.

## Diagnose first

```bash
docker compose exec postgres psql -U postgres -d mycologs -c "CREATE EXTENSION IF NOT EXISTS amcheck;"
docker compose exec postgres pg_amcheck --username=postgres --heapallindexed --database=mycologs --progress
```

Reading the output:

- **`tuple with aborted xmin N was updated to produce a tuple ... with committed
  xmin M`** — commit-log damage. An aborted transaction cannot have a committed
  successor; the clog is telling inconsistent stories.
- **`failed to find parent tuple for heap-only tuple at (B,O)`** — an orphaned
  HOT tuple. It has no index entry, so index scans never see it, but sequential
  scans (and therefore `pg_dump`) do. This is what makes a table look fine to the
  app while being unrestorable.
- **`toast value N not found in toast table`** — a large value is gone. If the
  toast table is `pg_toast_2619` that is `pg_statistic`, which is derived data
  and harmless; anything else is real data loss.

To see a row that `pg_dump` sees but the app doesn't, force a heap scan:

```sql
SET enable_indexscan = off;
SET enable_bitmapscan = off;
SELECT ctid, id, updated_at FROM posts WHERE id = <id>;
```

### Gotchas that cost time

- **A damaged `pg_statistic` blocks diagnosis.** Per-row scans fail identically
  on every row, because *planning* reads the broken statistics before any row is
  touched. `DELETE FROM pg_statistic;` is always safe — it is pure derived data,
  `pg_dump` never carries it, and `ANALYZE` regenerates it. Do that first, then
  re-run the scan.
- **Do not `VACUUM`.** Vacuum decides what to reclaim from exactly the
  transaction-status data that is damaged. In the 2026-08-27 incident autovacuum
  destroyed three `identifications.description` values *while the repair was in
  progress*. Rebuild promptly rather than letting it sit.
- **Never dedup on the damaged original.** Foreign keys fire on the *logical*
  key. Deleting one of two physical rows sharing `id = 859` with
  `DELETE ... WHERE ctid = ...` cascaded through `ON DELETE CASCADE` and removed
  that post's `media` rows, even though the post itself survived. Do the dedup
  inside the rebuilt copy, where tuples are ordinary rows.

## Repair by rebuild and swap

A logical dump and reload is the only thing that repairs commit-log damage: the
restore writes a pristine heap with fresh transaction IDs. The database is small,
so this is roughly one to two minutes of downtime.

```bash
./run.sh maintenance on

# 1. Get a dump out. If it fails on a specific row, null the unreadable column
#    (recover the value from the last good backup afterwards) and retry.
docker compose exec -T postgres pg_dump -U postgres -Fc mycologs > backups/pre-rebuild.dump

# 2. Build the replacement and verify it before touching production
docker compose exec -T postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS mycologs_fixed;" \
  -c "CREATE DATABASE mycologs_fixed OWNER postgres;"
docker compose exec -T postgres pg_restore -U postgres -d mycologs_fixed --no-owner < backups/pre-rebuild.dump
# re-apply anything recovered from backup here, then pg_amcheck mycologs_fixed

# 3. Swap. Each statement needs its own -c: ALTER DATABASE ... RENAME cannot run
#    inside a transaction block, and psql -c with multiple statements wraps them.
docker compose exec -T postgres psql -U postgres -d postgres \
  -c "ALTER DATABASE mycologs WITH ALLOW_CONNECTIONS false;" \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='mycologs';" \
  -c "ALTER DATABASE mycologs RENAME TO mycologs_broken;" \
  -c "ALTER DATABASE mycologs_fixed RENAME TO mycologs;"

docker compose exec -T postgres psql -U postgres -d mycologs -c "ANALYZE;"
./run.sh maintenance off
```

Blocking connections before terminating them makes the swap race-free. **No
container restart is needed** — `DATABASE_URL` binds the database by *name*, so
Prisma's pool reconnects straight into the swapped database, which also avoids
the `docker stop` AppArmor trap.

Keep `mycologs_broken` (it retains `ALLOW_CONNECTIONS false`) until you are
confident, then `DROP DATABASE mycologs_broken;`.

Afterwards: take a fresh `backup-full` and **rehearse it**. That is the point at
which you actually have a recovery point again.

## Do not restore business data onto the dev environment

A full dump carries live OAuth tokens, password hashes, real email addresses and
exact find coordinates. If you want realistic dev data, restore it and then
scrub it in the same session, before the API ever boots against it — pseudonymise
`users`, truncate `oauth_accounts` / `payments` / recovery-code tables, and
coarsen `posts.latitude` / `longitude`. Between restore and scrub, anything that
iterates users can email or LINE-push real people.
