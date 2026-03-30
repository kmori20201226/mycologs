"""
gbif_tools/pdf_name_importer.py
--------------------------------
Import japanese_name from a CSV extracted from a PDF document
into gbif.taxon, matched on scientific_name (genus + species epithet).

Matching strategy (most → least specific):
  1. Exact match on species column          e.g. "Pleurotus ostreatus"
  2. Genus-only fallback                    fills rows where only the genus
                                            matches AND japanese_name is still NULL
     (disabled by default — pass genus_fallback=True to enable)

Only rows where japanese_name IS NULL or japanese_name = ''
are updated, so existing names from other sources are never overwritten.
"""

import csv
import re
from .db import transaction


def _parse_csv(csv_path: str) -> list[tuple[str, str, str]]:
    """
    Read CSV with columns [japanese_name, scientific_name].
    Returns list of (japanese_name, genus, species_epithet).
    """
    rows = []
    with open(csv_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            jp  = row.get("japanese_name", "").strip()
            sci = row.get("scientific_name", "").strip()
            if not jp or not sci:
                continue
            parts = sci.split()
            if len(parts) < 2:
                continue
            genus, epithet = parts[0], parts[1]
            rows.append((jp, genus, epithet))
    return rows


def import_pdf_names(
    csv_path: str,
    genus_fallback: bool = False,
    overwrite: bool = False,
) -> None:
    """
    Update gbif.taxon.japanese_name from extracted PDF CSV.

    Args:
        csv_path:       Path to CSV with japanese_name, scientific_name columns.
        genus_fallback: If True, also fill NULL rows where only the genus
                        matches (useful for sp. entries you want partially covered).
        overwrite:      If True, update even rows that already have a name.
                        Default False — only fills NULL / empty rows.
    """
    rows = _parse_csv(csv_path)
    if not rows:
        print("No rows found in CSV.")
        return

    exact_updated  = 0
    genus_updated  = 0
    not_found      = 0

    null_clause = "" if overwrite else "AND (japanese_name IS NULL OR japanese_name = '')"

    with transaction() as cur:
        for jp_name, genus, epithet in rows:
            # ── Exact species match ──────────────────────────
            cur.execute(
                f"""
                UPDATE gbif.taxon
                SET    japanese_name = %s
                WHERE  genus   = %s
                  AND  species LIKE %s
                  {null_clause}
                """,
                (jp_name, genus, f"% {epithet}"),
            )
            if cur.rowcount > 0:
                exact_updated += cur.rowcount
                continue

            # ── Genus-only fallback ──────────────────────────
            if genus_fallback:
                cur.execute(
                    f"""
                    UPDATE gbif.taxon
                    SET    japanese_name = %s
                    WHERE  genus = %s
                      AND  japanese_name IS NULL
                    """,
                    (jp_name, genus),
                )
                if cur.rowcount > 0:
                    genus_updated += cur.rowcount
                    continue

            not_found += 1

    total = exact_updated + genus_updated
    print(f"Done.")
    print(f"  Exact species matches updated: {exact_updated:,}")
    if genus_fallback:
        print(f"  Genus fallback updated:        {genus_updated:,}")
    print(f"  Not found in DB:               {not_found:,}")
    print(f"  Total rows updated:            {total:,}")
