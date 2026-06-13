"""
gbif_tools/synonym_extractor.py
--------------------------------
Extract all available Japanese name synonyms for each taxon and write
them to a CSV file (one row per taxon × source).

Output columns:
    taxon_key       — gbif.taxon primary key
    scientific_name — canonical scientific name
    source          — "db" | "wikipedia" | "inat" | "gbif"
    name            — Japanese name from that source

Rows where a source yields no Japanese name are omitted.
The "db" row reflects the current japanese_name already stored in the DB.
"""

import csv
import sys
import time
from pathlib import Path
from tqdm import tqdm

from .db import transaction
from .name_fetcher import (
    _fetch_from_wikipedia,
    _fetch_from_inat,
    fetch_all_gbif_names,
    _SLEEP_SEC,
)


def extract_synonyms(output_path: Path, limit: int | None = None) -> None:
    with transaction() as cur:
        cur.execute(
            """
            SELECT taxon_key, species_key, scientific_name, japanese_name
            FROM   gbif.taxon
            WHERE  species IS NOT NULL
            ORDER  BY taxon_key
            """
            + (f" LIMIT {limit}" if limit else "")
        )
        rows = cur.fetchall()

    total = len(rows)
    if total == 0:
        print("No taxon rows found.")
        return

    print(f"Extracting synonyms for {total:,} taxa → {output_path}")

    written = 0
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["taxon_key", "scientific_name", "source", "name"])

        with tqdm(total=total, unit="taxon", dynamic_ncols=True, colour="green") as bar:
            for taxon_key, species_key, scientific_name, db_name in rows:
                sname = scientific_name or ""
                key   = species_key or taxon_key

                # Current DB value
                if db_name:
                    writer.writerow([taxon_key, sname, "db", db_name])
                    written += 1

                # Wikipedia
                wiki = _fetch_from_wikipedia(sname)
                time.sleep(_SLEEP_SEC)
                if wiki:
                    writer.writerow([taxon_key, sname, "wikipedia", wiki])
                    written += 1

                # iNaturalist
                inat = _fetch_from_inat(sname)
                time.sleep(_SLEEP_SEC)
                if inat:
                    writer.writerow([taxon_key, sname, "inat", inat])
                    written += 1

                # GBIF vernacularNames (all Japanese entries)
                for name in fetch_all_gbif_names(key):
                    writer.writerow([taxon_key, sname, "gbif", name])
                    written += 1
                time.sleep(_SLEEP_SEC)

                bar.update(1)

    print(f"Done. {written:,} name rows written across {total:,} taxa.")
