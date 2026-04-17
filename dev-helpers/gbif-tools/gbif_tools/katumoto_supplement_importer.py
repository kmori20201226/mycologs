"""
gbif_tools/katumoto_supplement_importer.py
-------------------------------------------
Import japanese_name from the Mycological Society of Japan's
"日本産菌類集覧 追加種データベース（2008年以降）" Excel file
into gbif.taxon.

Source:
    日本産菌類集覧 追加種データベース (2008年以降)
    日本菌学会データベース委員会
    https://www.mycology-jp.org/html/checklist.html
    License: CC BY 4.0
    Citation: 「日本産菌類集覧データベース」CC BY 4.0 日本菌学会データベース委員会

Usage:
    from pathlib import Path
    from gbif_tools.katumoto_supplement_importer import import_supplement_names

    import_supplement_names(Path("data") / "DB20200311.xlsx")

Excel columns (row 1 = header):
    NID | Status | Genus | SpEpithet | Author | ISRank | ISEpithet | ISAuthor |
    MB  | Basionym | BasJoun | Journal | Vol | Page | Year | Writer |
    Wamei | Habitat | Specimen | Note | RecBy | RegDate

Key columns used:
    Genus      — genus name
    SpEpithet  — species epithet
    ISRank     — infraspecific rank (var., f., subsp.) — empty for species
    ISEpithet  — infraspecific epithet
    Wamei      — Japanese name (空欄の場合はスキップ)
    Status     — record type; all are imported regardless of status

Note: Only 46 of 426 rows have a Wamei. Rows without a Wamei are silently
skipped since there is nothing to import.

Matching strategy (same as katumoto_name_importer):
    1. Infraspecific match  genus + species_epithet + infraspecific_epithet
    2. Species-level match  genus + species_epithet
    3. Genus fallback       genus only (opt-in via genus_fallback=True)
"""

from pathlib import Path
import openpyxl
from .db import transaction


def _load_excel(xlsx_path: Path) -> list[dict]:
    """
    Read DB20200311.xlsx and return rows that have a Wamei value.
    Silently skips rows where Wamei is empty.
    """
    wb = openpyxl.load_workbook(str(xlsx_path), data_only=True)
    ws = wb.active

    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        (nid, status, genus, epithet, author,
         isrank, isepithet, isauthor,
         mb, basionym, basjoun, journal, vol, page, year, writer,
         wamei, habitat, specimen, note, recby, regdate) = row

        # Skip rows without a Japanese name — nothing to import
        if not wamei or not str(wamei).strip():
            continue

        if not genus or not epithet:
            continue

        rows.append({
            "japanese_name": str(wamei).strip(),
            "genus":         str(genus).strip(),
            "epithet":       str(epithet).strip(),
            "rank":          str(isrank).strip()    if isrank    else "",
            "rank_epithet":  str(isepithet).strip() if isepithet else "",
            "status":        str(status).strip()    if status    else "",
        })

    wb.close()
    return rows


def import_supplement_names(
    xlsx_path: Path,
    genus_fallback: bool = False,
    overwrite: bool = False,
) -> None:
    """
    Update gbif.taxon.japanese_name from the post-2008 supplement Excel file.

    Source:
        https://www.mycology-jp.org/html/checklist.html
        CC BY 4.0 — 日本菌学会データベース委員会

    Args:
        xlsx_path:      Path object pointing to DB20200311.xlsx
                        (or a later version of the file).
        genus_fallback: Also fill NULL rows where only the genus matches.
        overwrite:      If True, update even rows that already have a name.
                        Default False — only fills NULL / empty rows.
    """
    print(f"Loading {xlsx_path.name} ...")
    rows = _load_excel(xlsx_path)
    print(f"  {len(rows):,} rows with Wamei loaded "
          f"(out of 426 total; rows without Wamei are skipped).")

    null_clause = "" if overwrite else \
        "AND (japanese_name IS NULL OR japanese_name = '')"

    exact_updated = 0
    infra_updated = 0
    genus_updated = 0
    not_found     = 0

    with transaction() as cur:
        for r in rows:
            jp       = r["japanese_name"]
            genus    = r["genus"]
            epithet  = r["epithet"]
            rank     = r["rank"]
            rank_epi = r["rank_epithet"]

            # ── 1. Infraspecific match ────────────────────────────────
            if rank and rank_epi:
                cur.execute(
                    f"""
                    UPDATE gbif.taxon
                    SET    japanese_name = %s
                    WHERE  genus = %s
                      AND  species LIKE %s
                      AND  infraspecific_epithet = %s
                      {null_clause}
                    """,
                    (jp, genus, f"% {epithet}", rank_epi),
                )
                if cur.rowcount > 0:
                    infra_updated += cur.rowcount
                    continue

            # ── 2. Species-level match ────────────────────────────────
            cur.execute(
                f"""
                UPDATE gbif.taxon
                SET    japanese_name = %s
                WHERE  genus   = %s
                  AND  species LIKE %s
                  {null_clause}
                """,
                (jp, genus, f"% {epithet}"),
            )
            if cur.rowcount > 0:
                exact_updated += cur.rowcount
                continue

            # ── 3. Genus-only fallback ────────────────────────────────
            if genus_fallback:
                cur.execute(
                    f"""
                    UPDATE gbif.taxon
                    SET    japanese_name = %s
                    WHERE  genus = %s
                      AND  japanese_name IS NULL
                    """,
                    (jp, genus),
                )
                if cur.rowcount > 0:
                    genus_updated += cur.rowcount
                    continue

            not_found += 1

    total = exact_updated + infra_updated + genus_updated
    print("Done.")
    print(f"  Species-level matches:      {exact_updated:,}")
    print(f"  Infraspecific matches:      {infra_updated:,}")
    if genus_fallback:
        print(f"  Genus fallback matches:     {genus_updated:,}")
    print(f"  Not found in DB:            {not_found:,}")
    print(f"  Total rows updated:         {total:,}")
