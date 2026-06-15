"""
gbif_tools/synonym_extractor.py
--------------------------------
Extract all available Japanese name synonyms for each taxon and write
them to a CSV file (one row per taxon × source).

Output columns:
    taxon_key       — gbif.taxon primary key (this name usage)
    species_key     — gbif accepted-species key; joins to mycologs
                      species.gbif_taxon_key (collapses synonyms onto the
                      accepted species)
    scientific_name — canonical scientific name
    source          — "db" | "wikipedia" | "inat" | "gbif"
    name            — Japanese name from that source

Rows where a source yields no Japanese name are omitted.
The "db" row reflects the current japanese_name already stored in the DB.

Resuming
--------
Each taxon is recorded in a sidecar progress file ("<output>.progress")
once it has been fully processed — including taxa that yielded no names.
Pass resume=True to skip already-processed taxa and append to the existing
CSV, so an interrupted run can be continued without re-querying the network
for work already done.
"""

import csv
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

# How often (in taxa) to emit a plain-text progress line to the log.
PROGRESS_EVERY = 25


def _progress_path(output_path: Path) -> Path:
    """Sidecar file that records taxon_keys already fully processed."""
    return output_path.with_name(output_path.name + ".progress")


def _load_done(output_path: Path) -> set[int]:
    """Build the set of already-processed taxon_keys for a resume.

    Primary source is the progress file (also captures taxa with no names);
    we additionally seed from any existing CSV so a resume still works even if
    the progress file is missing (e.g. a CSV produced before this feature).
    """
    done: set[int] = set()

    prog = _progress_path(output_path)
    if prog.exists():
        with prog.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    done.add(int(line))

    if output_path.exists():
        with output_path.open(encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            header = next(reader, None)  # skip header
            for row in reader:
                if row:
                    done.add(int(row[0]))

    return done


def _fmt_duration(seconds: float) -> str:
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:d}:{m:02d}:{s:02d}"


def extract_synonyms(
    output_path: Path,
    limit: int | None = None,
    resume: bool = False,
) -> None:
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
        print("No taxon rows found.", flush=True)
        return

    done = _load_done(output_path) if resume else set()
    if resume and done:
        rows = [r for r in rows if r[0] not in done]
        print(
            f"Resuming: {len(done):,} taxa already done, "
            f"{len(rows):,} remaining of {total:,}.",
            flush=True,
        )

    remaining = len(rows)
    if remaining == 0:
        print("Nothing to do — all taxa already processed.", flush=True)
        return

    print(
        f"Extracting synonyms for {remaining:,} taxa → {output_path}",
        flush=True,
    )

    # Append when resuming an existing file; otherwise (re)create it.
    file_mode = "a" if (resume and output_path.exists()) else "w"
    write_header = not (resume and output_path.exists() and output_path.stat().st_size > 0)
    prog_mode = "a" if resume else "w"

    written = 0
    started = time.monotonic()

    with output_path.open(file_mode, newline="", encoding="utf-8") as f, \
         _progress_path(output_path).open(prog_mode, encoding="utf-8") as prog:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(["taxon_key", "species_key", "scientific_name", "source", "name"])
            f.flush()

        with tqdm(total=remaining, unit="taxon", dynamic_ncols=True,
                  colour="green", disable=None) as bar:
            for processed, (taxon_key, species_key, scientific_name, db_name) in enumerate(rows, start=1):
                sname = scientific_name or ""
                skey  = species_key or taxon_key

                # Collect this taxon's rows, then write them together so a crash
                # mid-taxon can't leave a half-written taxon marked as done.
                taxon_rows: list[list] = []

                # Current DB value
                if db_name:
                    taxon_rows.append([taxon_key, skey, sname, "db", db_name])

                # Wikipedia
                wiki = _fetch_from_wikipedia(sname)
                time.sleep(_SLEEP_SEC)
                if wiki:
                    taxon_rows.append([taxon_key, skey, sname, "wikipedia", wiki])

                # iNaturalist
                inat = _fetch_from_inat(sname)
                time.sleep(_SLEEP_SEC)
                if inat:
                    taxon_rows.append([taxon_key, skey, sname, "inat", inat])

                # GBIF vernacularNames (all Japanese entries)
                for name in fetch_all_gbif_names(skey):
                    taxon_rows.append([taxon_key, skey, sname, "gbif", name])
                time.sleep(_SLEEP_SEC)

                writer.writerows(taxon_rows)
                f.flush()
                written += len(taxon_rows)

                # Mark the taxon done only after its rows are safely flushed.
                prog.write(f"{taxon_key}\n")
                prog.flush()

                bar.update(1)

                # Plain-text progress for the log (tqdm's bar is suppressed when
                # stderr isn't a terminal, so this is what you see in syn.log).
                if processed % PROGRESS_EVERY == 0 or processed == remaining:
                    elapsed = time.monotonic() - started
                    rate = elapsed / processed
                    eta = rate * (remaining - processed)
                    pct = processed / remaining * 100
                    print(
                        f"[{processed:,}/{remaining:,} {pct:5.1f}%] "
                        f"names={written:,} "
                        f"elapsed={_fmt_duration(elapsed)} "
                        f"eta={_fmt_duration(eta)} "
                        f"last_taxon={taxon_key}",
                        flush=True,
                    )

    print(f"Done. {written:,} name rows written across {remaining:,} taxa.", flush=True)
