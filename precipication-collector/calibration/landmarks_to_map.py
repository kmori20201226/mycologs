#!/usr/bin/env python3
"""
Turn a landmarks tsv into something Google Maps will plot.

    python landmarks_to_map.py landmarks-pref-38.tsv

Writes <stem>.csv and <stem>.kml beside the input, and prints paste-ready
"lat, lon" lines for spot-checking one point at a time.

  * .csv  — Google My Maps (mymaps.google.com) > Create new map > Import.
            Pick Latitude/Longitude as the position columns and Name as the
            title. Plots the whole set at once.
  * .kml  — same, and also opens directly in Google Earth.

NOTE THE COLUMN ORDER. The tsv is lon-then-lat, because that is the order the
affine works in; Google is lat-then-lon. Swapping them puts 山口 in the Gobi
desert, which is at least obvious — a subtler swap inside Japan would not be.
"""
from __future__ import annotations

import sys
import csv
from pathlib import Path
from xml.sax.saxutils import escape


def read(path: Path):
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split('#')[0].strip()
        if not line:
            continue
        f = line.split()
        if len(f) < 4:
            continue
        try:
            lon, lat = float(f[2]), float(f[3])
        except ValueError:
            continue
        full = ' '.join(f[4:]) or '?'
        # "波戸岬 (cape)" -> name, note
        name, _, note = full.partition('(')
        out.append((name.strip() or full, note.rstrip(')').strip(),
                    lat, lon, f[0] not in ('?', '-')))
    return out


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    src = Path(argv[1])
    rows = read(src)
    if not rows:
        sys.exit(f"no coordinates found in {src}")

    csv_path = src.with_suffix('.csv')
    with csv_path.open('w', newline='', encoding='utf-8-sig') as fh:
        w = csv.writer(fh)
        w.writerow(["Name", "Latitude", "Longitude", "Note", "In the fit"])
        for name, note, lat, lon, fitted in rows:
            w.writerow([name, f"{lat:.6f}", f"{lon:.6f}", note, "yes" if fitted else "held out"])

    kml_path = src.with_suffix('.kml')
    marks = "\n".join(
        f"  <Placemark>\n"
        f"    <name>{escape(name)}</name>\n"
        f"    <description>{escape(note or ('in the fit' if fitted else 'held out'))}</description>\n"
        f"    <Point><coordinates>{lon:.6f},{lat:.6f},0</coordinates></Point>\n"
        f"  </Placemark>"
        for name, note, lat, lon, fitted in rows)
    kml_path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n'
        f'  <name>{escape(src.stem)}</name>\n{marks}\n'
        '</Document></kml>\n', encoding='utf-8')

    print(f"{csv_path.name}  and  {kml_path.name}   ({len(rows)} points)\n")
    print("Paste any one of these straight into the Google Maps search box:\n")
    for name, note, lat, lon, fitted in rows:
        print(f"  {lat:.6f}, {lon:.6f}   {name}" + (f"  ({note})" if note else ""))


if __name__ == "__main__":
    main(sys.argv)
