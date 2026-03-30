import json
import time
import urllib.request
import urllib.error
import urllib.parse
from tqdm import tqdm
from .db import transaction

_SLEEP_SEC   = 0.3
_MAX_RETRIES = 3
_COMMIT_EVERY = 100   # commit to DB every N rows


def _is_japanese(text: str) -> bool:
    return any(
        "\u3040" <= c <= "\u9fff"
        or "\uff00" <= c <= "\uffef"
        for c in text
    )


def _get_json(url: str, timeout: int = 10) -> dict | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


# ── Source 1: Japanese Wikipedia ────────────────────────────

def _fetch_from_wikipedia(scientific_name: str) -> str | None:
    params = urllib.parse.urlencode({
        "action":    "opensearch",
        "search":    scientific_name,
        "limit":     5,
        "namespace": 0,
        "format":    "json",
    })
    data = _get_json(f"https://ja.wikipedia.org/w/api.php?{params}")

    if data and len(data) >= 2:
        for title in data[1]:
            if _is_japanese(title):
                return title

    # Fallback: direct page lookup with redirect resolution
    params2 = urllib.parse.urlencode({
        "action":    "query",
        "titles":    scientific_name,
        "redirects": 1,
        "format":    "json",
        "prop":      "info",
    })
    data2 = _get_json(f"https://ja.wikipedia.org/w/api.php?{params2}")
    if not data2:
        return None

    for redirect in data2.get("query", {}).get("redirects", []):
        title = redirect.get("to", "")
        if _is_japanese(title):
            return title

    for page in data2.get("query", {}).get("pages", {}).values():
        title = page.get("title", "")
        if _is_japanese(title) and page.get("ns") == 0:
            return title

    return None


# ── Source 2: iNaturalist ────────────────────────────────────

def _fetch_from_inat(scientific_name: str) -> str | None:
    params = urllib.parse.urlencode({
        "q":        scientific_name,
        "locale":   "ja",
        "rank":     "species",
        "per_page": 5,
    })
    data = _get_json(f"https://api.inaturalist.org/v1/taxa?{params}")
    if not data:
        return None

    for hit in data.get("results", []):
        if hit.get("name", "").lower() != scientific_name.lower():
            continue
        name = hit.get("preferred_common_name", "")
        if name and _is_japanese(name):
            return name

    return None


# ── Source 3: GBIF vernacularNames ──────────────────────────

def _fetch_from_gbif(species_key: int) -> str | None:
    url = f"https://api.gbif.org/v1/species/{species_key}/vernacularNames?limit=20"
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            for item in data.get("results", []):
                if item.get("language", "").lower() in ("ja", "jpn", "japanese"):
                    name = item.get("vernacularName", "")
                    if name and _is_japanese(name):
                        return name
            return None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 2 ** attempt
                tqdm.write(f"  GBIF 429 — waiting {wait}s ...")
                time.sleep(wait)
            else:
                return None
        except Exception:
            return None
    return None


# ── Waterfall ────────────────────────────────────────────────

def _fetch_japanese_name(
    species_key: int,
    scientific_name: str,
) -> tuple[str | None, str]:
    name = _fetch_from_wikipedia(scientific_name)
    time.sleep(_SLEEP_SEC)
    if name:
        return name, "wikipedia"

    name = _fetch_from_inat(scientific_name)
    time.sleep(_SLEEP_SEC)
    if name:
        return name, "inat"

    name = _fetch_from_gbif(species_key)
    time.sleep(_SLEEP_SEC)
    if name:
        return name, "gbif"

    return None, "none"


# ── Commit helper ────────────────────────────────────────────

def _commit_batch(batch: list[tuple[str | None, int]]) -> None:
    """
    Write and immediately commit a batch of updates.
    Each call is its own transaction so an interrupt mid-run
    only loses at most _COMMIT_EVERY rows of progress.
    """
    with transaction() as cur:
        for name, taxon_key in batch:
            cur.execute(
                "UPDATE gbif.taxon SET japanese_name = %s WHERE taxon_key = %s",
                (name, taxon_key),
            )


# ── Main ─────────────────────────────────────────────────────

def fetch_names() -> None:
    """
    Fill japanese_name for all gbif.taxon rows where it is NULL.
    Resumable: only processes NULL rows, commits every _COMMIT_EVERY rows.
    """
    with transaction() as cur:
        cur.execute(
            """
            SELECT taxon_key, species_key, scientific_name
            FROM   gbif.taxon
            WHERE  japanese_name IS NULL
              AND  species IS NOT NULL
            """
        )
        rows = cur.fetchall()

    total = len(rows)
    if total == 0:
        print("All japanese_name fields are already filled.")
        return

    filled    = 0
    from_wiki = 0
    from_inat = 0
    from_gbif = 0
    processed = 0
    batch: list[tuple[str | None, int]] = []

    with tqdm(
        total=total,
        desc="Fetching Japanese names",
        unit="taxon",
        dynamic_ncols=True,
        colour="green",
    ) as bar:
        for taxon_key, species_key, scientific_name in rows:
            key  = species_key or taxon_key
            name, source = _fetch_japanese_name(key, scientific_name or "")

            # Always append — NULL marks "checked, not found" so the
            # row is skipped on the next run (japanese_name IS NULL
            # query will no longer match it once we write NULL→NULL
            # ... actually we write NULL to stop re-querying).
            # For "not found" rows we store empty string "" so IS NULL
            # still only catches rows we haven't touched yet.
            batch.append((name if name else "", taxon_key))

            if name:
                filled += 1
                if source == "wikipedia": from_wiki += 1
                elif source == "inat":    from_inat += 1
                elif source == "gbif":    from_gbif += 1

            processed += 1

            # Update postfix on every row so counts are always current
            bar.set_postfix(
                found=filled,
                wiki=from_wiki,
                inat=from_inat,
                gbif=from_gbif,
                refresh=True,
            )
            bar.update(1)

            # Commit every _COMMIT_EVERY rows
            if processed % _COMMIT_EVERY == 0:
                _commit_batch(batch)
                batch.clear()
                tqdm.write(
                    f"  ✓ committed {processed:,} / {total:,} "
                    f"(+{filled} names found so far)"
                )

        # Final flush for any remainder
        if batch:
            _commit_batch(batch)

    print(f"\nDone. {filled:,} / {total:,} Japanese names filled.")
    print(f"  From Wikipedia:   {from_wiki:,}")
    print(f"  From iNaturalist: {from_inat:,}")
    print(f"  From GBIF:        {from_gbif:,}")
