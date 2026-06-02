"""
list-taxa subcommand: generate index.csv of candidate taxa for image pre-download.

Columns: taxon_id, scientific_name, japanese_name, inat_obs_japan, commercial_photo_count
"""

import csv
import sys
from pathlib import Path

from tqdm import tqdm

from .api import fetch_commercial_photo_count, fetch_species_in_japan

SPECIES_CSV = Path(__file__).parents[3] / "prisma" / "seed" / "taxonomy" / "species.csv"
FIELDNAMES = ["taxon_id", "scientific_name", "japanese_name", "inat_obs_japan", "commercial_photo_count"]


def _load_japanese_names() -> dict[str, str]:
    lookup: dict[str, str] = {}
    with open(SPECIES_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = row["scientific_name"].strip()
            ja = row["japanese_name"].strip()
            if name and ja:
                lookup[name.lower()] = ja
    return lookup


def run(args) -> int:
    print("Fetching fungal species observed in Japan from iNaturalist...", file=sys.stderr)
    results = fetch_species_in_japan()
    print(f"  {len(results)} species returned.", file=sys.stderr)

    ja_lookup = _load_japanese_names()
    print(f"  {len(ja_lookup)} Japanese names loaded from species.csv.", file=sys.stderr)

    rows = []
    it = tqdm(results, desc="Fetching commercial counts", unit="sp", disable=args.skip_commercial_count)
    for item in (results if args.skip_commercial_count else it):
        taxon = item["taxon"]
        taxon_id = taxon["id"]
        sci_name = taxon["name"]
        ja_name = ja_lookup.get(sci_name.lower(), "")
        obs_japan = item["count"]
        commercial = "" if args.skip_commercial_count else fetch_commercial_photo_count(taxon_id)
        rows.append({
            "taxon_id": taxon_id,
            "scientific_name": sci_name,
            "japanese_name": ja_name,
            "inat_obs_japan": obs_japan,
            "commercial_photo_count": commercial,
        })

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "index.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nWrote {len(rows)} rows to {out}", file=sys.stderr)
    return 0


def add_parser(subparsers):
    p = subparsers.add_parser(
        "list-taxa",
        help="Generate index.csv of candidate taxa for image pre-download.",
    )
    p.add_argument(
        "--output", "-o",
        default="iNaturalist-images",
        help="Output directory where index.csv is created (default: iNaturalist-images)",
    )
    p.add_argument(
        "--skip-commercial-count",
        action="store_true",
        help="Skip per-taxon commercial photo count query (much faster, leaves column blank).",
    )
    p.set_defaults(func=run)
