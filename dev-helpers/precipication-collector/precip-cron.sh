#!/usr/bin/env bash
#
# Hourly collection of tenki.jp Fukuoka radar snapshots. Installed as:
#
#     20 * * * * /home/kmori/mycologs/dev-helpers/precipication-collector/precip-cron.sh
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
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="/home/kmori/miniconda3/envs/mycologs/bin/python"
LOG="$DIR/cron.log"

exec >> "$LOG" 2>&1
echo "=== $(date -Is) ==="

if [ ! -x "$PYTHON" ]; then
    echo "FATAL: $PYTHON not found — has the conda env moved or been rebuilt?"
    exit 1
fi

"$PYTHON" "$DIR/precip_fill.py" fetch --hours 72

# Keep the log from growing without bound. Written to a temp file and moved so a
# concurrent run never reads a half-truncated log.
if [ "$(wc -l < "$LOG")" -gt 5000 ]; then
    tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
