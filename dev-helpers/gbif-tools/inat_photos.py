"""
iNaturalist photo fetcher (commercial-use filter) for mycologs.

Lists or downloads reference photos for a taxon, at a chosen size, together
with the attribution string CC licenses require you to display. By default
only commercially-usable photos are returned; pass --include-noncommercial
(--all) to also include NC / All-Rights-Reserved.

Usage:
    # list commercially-usable photo URLs at medium size
    python inat_photos.py "Lyophyllum shimeji" --size medium

    # download up to 30 large photos into ./out, writing credits.csv
    python inat_photos.py --taxon-id 550137 --size large --download ./out --max 30

    # count breakdown only
    python inat_photos.py --taxon-id 344658 --all --count-only
"""

from pathlib import Path
import argparse
import csv
import os
import sys
import time
import requests

API = "https://api.inaturalist.org/v1"

# Licenses that permit commercial use.
#   cc0       : no restrictions
#   cc-by     : attribution
#   cc-by-sa  : attribution + share-alike (derivatives must use same license)
#   cc-by-nd  : attribution + no derivatives (display unmodified only)
# Excluded for commercial: cc-by-nc, cc-by-nc-sa, cc-by-nc-nd and "" (All Rights Reserved).
COMMERCIAL_LICENSES = ["cc0", "cc-by", "cc-by-sa", "cc-by-nd"]

SIZES = ["square", "small", "medium", "large", "original"]

HEADERS = {"User-Agent": "mycologs/1.0 (https://example.com; contact@example.com)"}
# Stay well under the 60 req/min recommendation for API calls.
SLEEP_BETWEEN_PAGES = 1.1
# Be polite to the image hosts too.
SLEEP_BETWEEN_DOWNLOADS = 0.3


def resolve_taxon_id(name: str) -> int | None:
    r = requests.get(
        f"{API}/taxa",
        params={"q": name, "rank": "species"},
        headers=HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    results = r.json().get("results", [])
    return results[0]["id"] if results else None


def sized_url(square_url: str, size: str) -> str:
    """iNat encodes the size as a filename token: .../photos/123/square.jpg"""
    if not square_url:
        return ""
    return square_url.replace("/square.", f"/{size}.")


def count_photos(taxon_id: int, commercial_only: bool = True) -> int:
    params: dict = {"taxon_id": taxon_id, "per_page": 0}
    if commercial_only:
        params["photo_license"] = ",".join(COMMERCIAL_LICENSES)
    else:
        params["photos"] = "true"
    r = requests.get(f"{API}/observations", params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json().get("total_results", 0)


def fetch_photos(
    taxon_id: int, size: str, max_photos: int = 200, commercial_only: bool = True
) -> list[dict]:
    """Returns photo dicts tagged with license, commercial flag, and a sized URL."""
    photos: list[dict] = []
    page = 1
    per_page = 100
    while len(photos) < max_photos:
        params: dict = {"taxon_id": taxon_id, "per_page": per_page, "page": page}
        if commercial_only:
            params["photo_license"] = ",".join(COMMERCIAL_LICENSES)
        else:
            params["photos"] = "true"
        r = requests.get(f"{API}/observations", params=params, headers=HEADERS, timeout=30)
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            break
        for obs in results:
            for p in obs.get("photos", []):
                license_code = p.get("license_code")  # None == All Rights Reserved
                is_commercial = license_code in COMMERCIAL_LICENSES
                if commercial_only and not is_commercial:
                    continue
                square = p.get("url", "")
                photos.append(
                    {
                        "id": p.get("id"),
                        "license": license_code or "all-rights-reserved",
                        "commercial": is_commercial,
                        "attribution": p.get("attribution", ""),
                        "url": sized_url(square, size),
                        "observation_id": obs.get("id"),
                    }
                )
        page += 1
        time.sleep(SLEEP_BETWEEN_PAGES)
    return photos[:max_photos]


def download_photos(photos: list[dict], out_dir: Path, size: str) -> Path:
    """Downloads each photo into out_dir and writes credits.csv. Returns manifest path."""
    os.makedirs(out_dir, exist_ok=True)
    manifest = out_dir / "credits.csv"
    with open(manifest, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            ["filename", "license", "commercial", "attribution", "observation_id", "url"]
        )
        for ph in photos:
            url = ph["url"]
            if not url:
                continue
            ext = url.rsplit(".", 1)[-1].split("?")[0] or "jpg"
            filename = f"{ph['id']}_{size}.{ext}"
            dest = out_dir / filename
            try:
                resp = requests.get(url, headers=HEADERS, timeout=60, stream=True)
                resp.raise_for_status()
                with open(dest, "wb") as img:
                    for chunk in resp.iter_content(chunk_size=8192):
                        img.write(chunk)
            except requests.RequestException as e:
                print(f"  ! failed {url}: {e}", file=sys.stderr)
                continue
            writer.writerow(
                [
                    filename,
                    ph["license"],
                    "yes" if ph["commercial"] else "no",
                    ph["attribution"],
                    ph["observation_id"],
                    url,
                ]
            )
            print(f"  saved {filename}  [{ph['license']}]")
            time.sleep(SLEEP_BETWEEN_DOWNLOADS)
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("name", nargs="?", help="Scientific name, e.g. 'Lyophyllum shimeji'")
    ap.add_argument("--taxon-id", type=int, default=None)
    ap.add_argument("--size", choices=SIZES, default="medium", help="Image size (default: medium)")
    ap.add_argument("--download", metavar="DIR", default=None, help="Download into DIR")
    ap.add_argument("--count-only", action="store_true")
    ap.add_argument("--max", type=int, default=50)
    ap.add_argument(
        "--include-noncommercial",
        "--all",
        dest="include_noncommercial",
        action="store_true",
        help="Also include NonCommercial / All-Rights-Reserved photos (labelled).",
    )
    args = ap.parse_args()

    taxon_id = args.taxon_id or (resolve_taxon_id(args.name) if args.name else None)
    if not taxon_id:
        print("Could not resolve taxon.", file=sys.stderr)
        return 1

    commercial_only = not args.include_noncommercial

    commercial_total = count_photos(taxon_id, commercial_only=True)
    print(f"taxon_id={taxon_id}")
    print(f"  commercially-usable observations: {commercial_total}")
    if args.include_noncommercial:
        all_total = count_photos(taxon_id, commercial_only=False)
        print(f"  all observations with photos:     {all_total}")
        print(f"  non-commercial / ARR:             {all_total - commercial_total}")
    if args.count_only:
        return 0

    photos = fetch_photos(
        taxon_id, size=args.size, max_photos=args.max, commercial_only=commercial_only
    )

    if args.download:
        destn = Path(args.download) / f"{taxon_id}"
        print(f"\nDownloading {len(photos)} photos ({args.size}) into {str(destn)}:")
        manifest = download_photos(photos, destn, args.size)
        print(f"\nDone. Attribution manifest: {str(manifest)}")
    else:
        label = "photos" if args.include_noncommercial else "commercially-licensed photos"
        print(f"\nCollected {len(photos)} {label} ({args.size} URLs):\n")
        for ph in photos:
            mark = "OK " if ph["commercial"] else "NG "
            print(f"  {mark}[{ph['license']:18}] {ph['url']}")
            print(f"               {ph['attribution']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
