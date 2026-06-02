"""
download subcommand: download iNaturalist images for taxa listed in index.csv.

Images are saved to <output>/<taxon-id>/<photo-id>_<size>.<ext>
Credits metadata is saved to <output>/<taxon-id>/credits.csv, keyed by filename.
"""

import csv
import sys
from pathlib import Path

import requests
from tqdm import tqdm

from .api import SIZES, SLEEP_DOWNLOAD, fetch_photos

INDEX_FILENAME = "index.csv"
CREDITS_FIELDNAMES = [
    "filename", "photo_id", "license", "attribution", "photographer",
    "observed_on", "time_observed_at", "place_guess", "latitude", "longitude",
    "observation_id", "url",
]


def _load_index(index_path: Path) -> list[dict]:
    with open(index_path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _print_summary(rows: list[dict]) -> None:
    total = len(rows)
    with_ja = sum(1 for r in rows if r.get("japanese_name", "").strip())
    with_commercial = sum(1 for r in rows if r.get("commercial_photo_count", "").strip())
    obs_counts = [int(r["inat_obs_japan"]) for r in rows if r.get("inat_obs_japan", "").strip()]

    print(f"index.csv summary:")
    print(f"  Total taxa:              {total}")
    print(f"  With Japanese name:      {with_ja} ({with_ja * 100 // total}%)")
    if obs_counts:
        print(f"  Obs in Japan — max:      {max(obs_counts)}")
        print(f"  Obs in Japan — min:      {min(obs_counts)}")
    if with_commercial:
        commercial_counts = [
            int(r["commercial_photo_count"])
            for r in rows
            if r.get("commercial_photo_count", "").strip()
        ]
        print(f"  Commercial photos — avg: {sum(commercial_counts) // len(commercial_counts)}")
    else:
        print(f"  Commercial photo count:  (not fetched — run list-taxa without --skip-commercial-count)")
    print()
    print(f"To download, run with --limit N (e.g. --limit 100)")


def _download_taxon(taxon_id: int, sci_name: str, out_dir: Path, size: str, max_photos: int) -> int:
    photos = fetch_photos(taxon_id, size=size, max_photos=max_photos)
    if not photos:
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    credits_path = out_dir / "credits.csv"
    saved = 0

    with open(credits_path, "w", newline="", encoding="utf-8") as cf:
        writer = csv.DictWriter(cf, fieldnames=CREDITS_FIELDNAMES)
        writer.writeheader()

        for photo in tqdm(photos, desc=f"  {sci_name}", unit="img", leave=False):
            url = photo["url"]
            if not url:
                continue
            ext = url.rsplit(".", 1)[-1].split("?")[0] or "jpg"
            filename = f"{photo['photo_id']}_{size}.{ext}"
            dest = out_dir / filename
            try:
                resp = requests.get(url, headers={"User-Agent": "mycologs/1.0"}, timeout=60, stream=True)
                resp.raise_for_status()
                with open(dest, "wb") as img:
                    for chunk in resp.iter_content(chunk_size=8192):
                        img.write(chunk)
            except requests.RequestException as e:
                print(f"    ! failed {url}: {e}", file=sys.stderr)
                continue
            writer.writerow({
                "filename": filename,
                "photo_id": photo["photo_id"],
                "license": photo["license"],
                "attribution": photo["attribution"],
                "photographer": photo["photographer"],
                "observed_on": photo["observed_on"],
                "time_observed_at": photo["time_observed_at"],
                "place_guess": photo["place_guess"],
                "latitude": photo["latitude"],
                "longitude": photo["longitude"],
                "observation_id": photo["observation_id"],
                "url": url,
            })
            saved += 1

    return saved


def run(args) -> int:
    out_dir = Path(args.output)
    index_path = out_dir / INDEX_FILENAME

    if not index_path.exists():
        print(f"Error: {index_path} not found. Run 'inat-images list-taxa -o {out_dir}' first.", file=sys.stderr)
        return 1

    rows = _load_index(index_path)

    if args.limit == 0:
        _print_summary(rows)
        return 0

    targets = rows[: args.limit]
    print(f"Downloading images for {len(targets)} taxa → {out_dir}/", file=sys.stderr)

    total_saved = 0
    skipped = 0
    for row in tqdm(targets, desc="Taxa", unit="taxon"):
        taxon_id = int(row["taxon_id"])
        sci_name = row["scientific_name"]
        taxon_dir = out_dir / str(taxon_id)

        if args.skip_existing and taxon_dir.exists():
            skipped += 1
            continue

        saved = _download_taxon(taxon_id, sci_name, taxon_dir, args.size, args.max_per_taxon)
        total_saved += saved

    print(f"\nDone. {total_saved} images saved, {skipped} taxa skipped.", file=sys.stderr)
    return 0


def add_parser(subparsers):
    p = subparsers.add_parser(
        "download",
        help="Download images for taxa listed in index.csv.",
    )
    p.add_argument(
        "--output", "-o",
        default="iNaturalist-images",
        help="Directory containing index.csv and where images are saved (default: iNaturalist-images)",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Number of taxa to process from index.csv. 0 (default) shows summary only.",
    )
    p.add_argument(
        "--size",
        choices=SIZES,
        default="medium",
        help="Image size to download (default: medium)",
    )
    p.add_argument(
        "--max-per-taxon",
        type=int,
        default=50,
        help="Max images to download per taxon (default: 50)",
    )
    p.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip taxa whose directory already exists in --output.",
    )
    p.set_defaults(func=run)
