# Disaster recovery

How to back up the business server, and how to bring it back after a crash.

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
| `db.toc.txt` | The verified table of contents (see below). |

Every backup is verified before it is bundled: the dump is read back through
`pg_restore --list`, and the run fails if it yields no restorable entries. A
backup you have never read back is not a backup.

Retention defaults to the newest 7 archives. Override with
`MYCOLOGS_BACKUP_KEEP=14 ./run.sh backup-full`.

### Take one before every upgrade

The v1.7.1 incident (unclean reboot → WAL corruption) is exactly the case this
protects against. Run `backup-full` and confirm it reports `ok (N restorable
entries)` *before* starting any deploy or migration.

## Pulling it to another machine

The archive holds live OAuth access/refresh tokens, every password hash, and all
API keys. Keep it 0600 and keep it off the internet.

```bash
scp mycologs:mycologs/business-sandbox/backups/mycologs-full-<ts>.tar .
scp mycologs:mycologs/business-sandbox/backups/mycologs-full-<ts>.tar.sha256 .
sha256sum -c mycologs-full-<ts>.tar.sha256
```

A backup that only exists on the business VM does not survive that VM dying.
Pull regularly.

## Restoring

```bash
./run.sh maintenance on          # stop the API writing during the restore
./run.sh restore-full backups/mycologs-full-<ts>.tar
./run.sh start
./run.sh maintenance off
```

`restore-full` prints the manifest, requires you to type `RESTORE`, then drops
and recreates the `mycologs` database, restores the dump, and replaces
`uploads/` — keeping the previous directory as `uploads.pre-restore-<epoch>` so
nothing is destroyed outright.

Use `maintenance on` rather than stopping containers. On this host `docker stop`
hits the snap/AppArmor permission trap; the restore never needs it.

The backup's `.env` is deliberately **not** applied automatically — it is written
to `backups/env.from-backup` for you to diff:

```bash
diff .env backups/env.from-backup
```

Restoring onto a *fresh* machine also needs: the repo, the image tarball
(`./run.sh load dist/<tarball>`), and that `.env` in place before `start`.

## Rehearse it

Restore into a scratch database on a non-production machine and compare row
counts against `MANIFEST.txt`. Do this once now, and again after any schema
change big enough to worry you. The failure mode of an untested restore is
discovering the problem during the outage.

## Do not restore business data onto the dev environment

A full dump carries live OAuth tokens, password hashes, real email addresses and
exact find coordinates. If you want realistic dev data, restore it and then
scrub it in the same session, before the API ever boots against it — pseudonymise
`users`, truncate `oauth_accounts` / `payments` / recovery-code tables, and
coarsen `posts.latitude` / `longitude`. Between restore and scrub, anything that
iterates users can email or LINE-push real people.
