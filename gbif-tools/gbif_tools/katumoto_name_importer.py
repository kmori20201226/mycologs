"""
gbif_tools/katumoto_name_importer.py
-------------------------------------
Import japanese_name from the Mycological Society of Japan's
"日本産菌類集覧和名リスト" Excel file into gbif.taxon.

Source:
    日本産菌類集覧和名リスト (～2008年)（Excelファイル）
    日本菌学会データベース委員会, 2019-01-08
    https://www.mycology-jp.org/html/checklist_wlist.html
    License: CC BY 4.0
    Citation: 「日本産菌類集覧データベース」CC BY 4.0 日本菌学会データベース委員会

Excel columns (row 1 = header):
    ID | 和名 | 学名 | 属名 | 種小名 | 種内ランク1 | 種内ランク1種小名 | ページ | Note

Matching strategy (most → least specific, applied in order):
    1. Species-level exact match   genus + species_epithet → species column
    2. Infraspecific exact match   genus + epithet + rank + rankname (var./f./subsp.)
    3. Genus-only fallback         fills NULL rows where only genus matches
       (disabled by default — pass genus_fallback=True)

Only rows where japanese_name IS NULL or japanese_name = '' are updated
by default, so existing names from other sources are never overwritten.
Pass overwrite=True to update all rows.
"""

import openpyxl
from .db import transaction


def _load_excel(xlsx_path: str) -> list[dict]:
    """
    Read the Katumoto wamei Excel file and return a list of dicts.
    Skips genus-only rows (和名 ending in '属') and rows with no epithet.
    Handles infraspecific entries (var., f., subsp.) by building the
    full scientific name from genus + epithet + rank + rankname.
    """
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb.active

    rows = []
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        id_, wamei, gakumei, genus, epithet, rank1, rank1name, page, note = row

        # Skip empty rows
        if not wamei or not genus:
            continue

        wamei = str(wamei).strip()
        genus = str(genus).strip()

        # Skip genus-only entries (e.g. "アイカワタケ属")
        if wamei.endswith("属") or not epithet:
            continue

        epithet   = str(epithet).strip()
        rank1     = str(rank1).strip()     if rank1     else ""
        rank1name = str(rank1name).strip() if rank1name else ""

        rows.append({
            "japanese_name": wamei,
            "genus":         genus,
            "epithet":       epithet,
            "rank":          rank1,       # e.g. "var.", "f.", "subsp.", ""
            "rank_epithet":  rank1name,   # e.g. "pinetorum"
        })

    wb.close()
    return rows


def import_katumoto_names(
    xlsx_path: str,
    genus_fallback: bool = False,
    overwrite: bool = False,
) -> None:
    """
    Update gbif.taxon.japanese_name from the Katumoto wamei Excel file.

    Source:
        https://www.mycology-jp.org/html/checklist_wlist.html
        CC BY 4.0 — 日本菌学会データベース委員会

    Args:
        xlsx_path:      Path to Katumoto-Wamei.xlsx.
        genus_fallback: Also fill NULL rows where only the genus matches
                        (useful for genera with a single species in your DB).
        overwrite:      If True, update even rows that already have a name.
                        Default False — only fills NULL / empty rows.
    """
    print(f"Loading {xlsx_path} ...")
    rows = _load_excel(xlsx_path)
    print(f"  {len(rows):,} species/infraspecific entries loaded.")

    null_clause = "" if overwrite else \
        "AND (japanese_name IS NULL OR japanese_name = '')"

    exact_updated = 0
    infra_updated = 0
    genus_updated = 0
    not_found     = 0

    with transaction() as cur:
        for r in rows:
            jp        = r["japanese_name"]
            genus     = r["genus"]
            epithet   = r["epithet"]
            rank      = r["rank"]
            rank_epi  = r["rank_epithet"]

            # ── 1. Infraspecific match (var. / f. / subsp.) ──────────
            if rank and rank_epi:
                cur.execute(
                    f"""
                    UPDATE gbif.taxon
                    SET    japanese_name = %s
                    WHERE  genus   = %s
                      AND  species LIKE %s
                      AND  infraspecific_epithet = %s
                      {null_clause}
                    """,
                    (jp, genus, f"% {epithet}", rank_epi),
                )
                if cur.rowcount > 0:
                    infra_updated += cur.rowcount
                    continue

            # ── 2. Species-level exact match ─────────────────────────
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
