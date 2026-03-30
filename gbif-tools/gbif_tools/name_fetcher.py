import json
import time
import urllib.request
import urllib.error
from tqdm import tqdm
from .db import transaction

_BATCH_SIZE  = 50
_SLEEP_SEC   = 0.05
_MAX_RETRIES = 3


def _fetch_japanese_name(species_key: int) -> str | None:
    url = f"https://api.gbif.org/v1/species/{species_key}/vernacularNames?limit=20"

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            for item in data.get("results", []):
                if item.get("language", "").lower() in ("ja", "jpn", "japanese"):
                    return item.get("vernacularName") or None
            return None

        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 2 ** attempt
                tqdm.write(f"  429 rate-limited — waiting {wait}s ...")
                time.sleep(wait)
            else:
                tqdm.write(f"  HTTP {e.code} for speciesKey={species_key}, skipping")
                return None

        except Exception as e:
            tqdm.write(f"  Error for speciesKey={species_key}: {e}, skipping")
            return None

    return None


def fetch_names() -> None:
    """
    Fill japanese_name for all gbif.taxon rows where it is NULL.
    Resumable: only processes NULL rows so re-running continues from
    where it left off.
    Uses tqdm to show progress.
    """
    with transaction() as cur:
        cur.execute(
            "SELECT taxon_key, species_key FROM gbif.taxon WHERE japanese_name IS NULL"
        )
        rows = cur.fetchall()

    total = len(rows)

    if total == 0:
        print("All japanese_name fields are already filled.")
        return

    filled = 0
    updates: list[tuple[str | None, int]] = []

    with tqdm(
        total=total,
        desc="Fetching Japanese names",
        unit="taxon",
        dynamic_ncols=True,
        colour="green",
    ) as bar:
        for taxon_key, species_key in rows:
            key  = species_key or taxon_key
            name = _fetch_japanese_name(key)

            updates.append((name, taxon_key))

            if name:
                filled += 1
                bar.set_postfix_str(f"found={filled}", refresh=False)

            # Flush batch to DB
            if len(updates) >= _BATCH_SIZE:
                _write_updates(updates)
                updates.clear()

            bar.update(1)
            time.sleep(_SLEEP_SEC)

        # Final flush
        if updates:
            _write_updates(updates)

    print(f"\nDone. {filled:,} Japanese names filled out of {total:,} taxa.")


def _write_updates(updates: list[tuple[str | None, int]]) -> None:
    with transaction() as cur:
        for name, taxon_key in updates:
            cur.execute(
                "UPDATE gbif.taxon SET japanese_name = %s WHERE taxon_key = %s",
                (name, taxon_key),
            )