#!/usr/bin/env bash
#
# Hourly collection of tenki.jp radar snapshots. Installed as:
#
#     20 * * * * /home/kmori/mycologs/precipication-collector/precip-cron.sh
#
# Twenty past the hour, to give the archive time to publish. Absolute paths
# throughout because cron runs with a near-empty environment — no conda, no
# PATH to speak of, and a working directory that is not this one.
#
# --hours 72 rather than 1 on purpose: precip_fill.py fetch scans a window and
# fills whatever is missing, so a machine that was asleep, offline, or simply
# switched off catches up on its next run without anyone intervening. That
# matters here specifically, because this runs on a WSL2 desktop that is only
# up when Windows is. Three days of slack absorbs a weekend.
#
# Hours that tenki.jp never published (20 of them in the first 20 months) are
# reported as absent and retried while they remain inside the window, then
# forgotten. That is correct: they are not coming.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="/home/kmori/miniconda3/envs/mycologs/bin/python"
LOG="$DIR/cron.log"

exec >> "$LOG" 2>&1
echo "=== $(date -Is) ==="

if [ ! -x "$PYTHON" ]; then
    echo "FATAL: $PYTHON not found — has the conda env moved or been rebuilt?"
    exit 1
fi

# One map per prefecture, each its own download and its own precip_grids row.
# All five calibrated maps: 38 山口, 43 福岡, 44 佐賀, 46 熊本, 47 大分.
#
# Each code costs ~620 MB/year of JPEGs, so this is ~3.1 GB/year in total, plus
# ~1 GB per prefecture if its archive is ever backfilled. Adding a code requires
# that precip_extract.PREFECTURES already has a calibrated affine — precip_fill.py
# refuses the code otherwise rather than guessing.
#
# A failing prefecture must not stop the others, so each runs in its own
# statement and the exit status is collected at the end. This also means the
# run now takes five downloads an hour rather than one; at 0.5 s of courtesy
# delay each that is still nothing, but it is no longer a single request.
PREFS="38 43 44 46 47"
rc=0
for pref in $PREFS; do
    echo "--- pref-$pref"
    "$PYTHON" "$DIR/precip_fill.py" --pref "$pref" fetch --hours 72 || rc=$?
done

# Keep the log from growing without bound. Written to a temp file and moved so a
# concurrent run never reads a half-truncated log.
if [ "$(wc -l < "$LOG")" -gt 5000 ]; then
    tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

exit "$rc"
