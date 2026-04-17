import time
from .models import TaxonRow, OccurrenceRow
from .db import transaction, execute_batch
from .schema import create_schema
from .config import BATCH_SIZE


# ── TSV helpers ──────────────────────────────────────────────

def _parse_line(line: str) -> list[str]:
    return line.rstrip("\n").split("\t")

def _str(v: str) -> str | None:
    return v.strip() or None

def _int(v: str) -> int | None:
    v = v.strip()
    return int(v) if v else None

def _float(v: str) -> float | None:
    v = v.strip()
    return float(v) if v else None

def _col_index(filepath: str) -> dict[str, int]:
    with open(filepath, encoding="utf-8") as f:
        return {name: i for i, name in enumerate(_parse_line(f.readline()))}

def _get(cols: list[str], idx: dict[str, int], name: str) -> str:
    i = idx.get(name)
    return cols[i].strip() if i is not None and i < len(cols) else ""

def _is_target_row(cols: list[str], idx: dict[str, int]) -> bool:
    """Return True if this row should be processed (Fungi, SPECIES, ACCEPTED)."""
    g = lambda name: _get(cols, idx, name)
    return (
        g("kingdom")        == "Fungi"
        and g("taxonRank")  == "SPECIES"
        and g("taxonomicStatus") in ("ACCEPTED", "")
    )


# ── Row parsers ──────────────────────────────────────────────

def _parse_taxon(cols: list[str], idx: dict[str, int]) -> TaxonRow | None:
    g = lambda name: _get(cols, idx, name)
    raw_key = g("taxonKey") or g("speciesKey")
    if not raw_key:
        return None
    return TaxonRow(
        taxon_key             = int(raw_key),
        species_key           = _int(g("speciesKey")),
        kingdom               = _str(g("kingdom")),
        phylum                = _str(g("phylum")),
        class_                = _str(g("class")),
        order                 = _str(g("order")),
        family                = _str(g("family")),
        genus                 = _str(g("genus")),
        species               = _str(g("species")),
        infraspecific_epithet = _str(g("infraspecificEpithet")),
        taxon_rank            = _str(g("taxonRank")),
        scientific_name       = _str(g("scientificName")),
        taxonomic_status      = _str(g("taxonomicStatus")),
    )

def _parse_occurrence(cols: list[str], idx: dict[str, int]) -> OccurrenceRow | None:
    g = lambda name: _get(cols, idx, name)
    raw_gbif_id = g("gbifID")
    raw_key     = g("taxonKey") or g("speciesKey")
    if not raw_gbif_id or not raw_key:
        return None
    return OccurrenceRow(
        gbif_id                             = int(raw_gbif_id),
        occurrence_id                       = _str(g("occurrenceID")),
        dataset_key                         = _str(g("datasetKey")),
        taxon_key                           = int(raw_key),
        verbatim_scientific_name            = _str(g("verbatimScientificName")),
        verbatim_scientific_name_authorship = _str(g("verbatimScientificNameAuthorship")),
        country_code                        = _str(g("countryCode")),
        state_province                      = _str(g("stateProvince")),
        locality                            = _str(g("locality")),
        decimal_latitude                    = _float(g("decimalLatitude")),
        decimal_longitude                   = _float(g("decimalLongitude")),
        coordinate_uncertainty_m            = _float(g("coordinateUncertaintyInMeters")),
        coordinate_precision                = _float(g("coordinatePrecision")),
        elevation_m                         = _float(g("elevation")),
        elevation_accuracy_m                = _float(g("elevationAccuracy")),
        event_date                          = _str(g("eventDate")),
        year                                = _int(g("year")),
        month                               = _int(g("month")),
        day                                 = _int(g("day")),
        occurrence_status                   = _str(g("occurrenceStatus")),
        individual_count                    = _int(g("individualCount")),
        basis_of_record                     = _str(g("basisOfRecord")),
        identified_by                       = _str(g("identifiedBy")),
        date_identified                     = _str(g("dateIdentified")),
        recorded_by                         = _str(g("recordedBy")),
        type_status                         = _str(g("typeStatus")),
        establishment_means                 = _str(g("establishmentMeans")),
        institution_code                    = _str(g("institutionCode")),
        collection_code                     = _str(g("collectionCode")),
        catalog_number                      = _str(g("catalogNumber")),
        record_number                       = _str(g("recordNumber")),
        license                             = _str(g("license")),
        rights_holder                       = _str(g("rightsHolder")),
        media_type                          = _str(g("mediaType")),
        issue                               = _str(g("issue")),
        last_interpreted                    = _str(g("lastInterpreted")) or None,
    )


# ── SQL ──────────────────────────────────────────────────────

_UPSERT_TAXON = """
INSERT INTO gbif.taxon (
    taxon_key, species_key,
    kingdom, phylum, class, "order", family, genus, species,
    infraspecific_epithet, taxon_rank, scientific_name, taxonomic_status
) VALUES (
    %(taxon_key)s, %(species_key)s,
    %(kingdom)s, %(phylum)s, %(class_)s, %(order)s, %(family)s, %(genus)s, %(species)s,
    %(infraspecific_epithet)s, %(taxon_rank)s, %(scientific_name)s, %(taxonomic_status)s
)
ON CONFLICT (taxon_key) DO UPDATE SET
    species_key           = EXCLUDED.species_key,
    kingdom               = EXCLUDED.kingdom,
    phylum                = EXCLUDED.phylum,
    class                 = EXCLUDED.class,
    "order"               = EXCLUDED."order",
    family                = EXCLUDED.family,
    genus                 = EXCLUDED.genus,
    species               = EXCLUDED.species,
    infraspecific_epithet = EXCLUDED.infraspecific_epithet,
    taxon_rank            = EXCLUDED.taxon_rank,
    scientific_name       = EXCLUDED.scientific_name,
    taxonomic_status      = EXCLUDED.taxonomic_status,
    last_synced_at        = now()
"""

_UPSERT_OCCURRENCE = """
INSERT INTO gbif.occurrence (
    gbif_id, occurrence_id, dataset_key, taxon_key,
    verbatim_scientific_name, verbatim_scientific_name_authorship,
    country_code, state_province, locality,
    decimal_latitude, decimal_longitude,
    coordinate_uncertainty_m, coordinate_precision,
    elevation_m, elevation_accuracy_m,
    event_date, year, month, day,
    occurrence_status, individual_count, basis_of_record,
    identified_by, date_identified, recorded_by,
    type_status, establishment_means,
    institution_code, collection_code, catalog_number, record_number,
    license, rights_holder, media_type, issue, last_interpreted
) VALUES (
    %(gbif_id)s, %(occurrence_id)s, %(dataset_key)s, %(taxon_key)s,
    %(verbatim_scientific_name)s, %(verbatim_scientific_name_authorship)s,
    %(country_code)s, %(state_province)s, %(locality)s,
    %(decimal_latitude)s, %(decimal_longitude)s,
    %(coordinate_uncertainty_m)s, %(coordinate_precision)s,
    %(elevation_m)s, %(elevation_accuracy_m)s,
    %(event_date)s, %(year)s, %(month)s, %(day)s,
    %(occurrence_status)s, %(individual_count)s, %(basis_of_record)s,
    %(identified_by)s, %(date_identified)s, %(recorded_by)s,
    %(type_status)s, %(establishment_means)s,
    %(institution_code)s, %(collection_code)s, %(catalog_number)s, %(record_number)s,
    %(license)s, %(rights_holder)s, %(media_type)s, %(issue)s, %(last_interpreted)s
)
ON CONFLICT (gbif_id) DO UPDATE SET
    taxon_key        = EXCLUDED.taxon_key,
    occurrence_status = EXCLUDED.occurrence_status,
    decimal_latitude  = EXCLUDED.decimal_latitude,
    decimal_longitude = EXCLUDED.decimal_longitude,
    last_interpreted  = EXCLUDED.last_interpreted,
    issue             = EXCLUDED.issue
"""


# ── Passes ───────────────────────────────────────────────────

def _pass_taxon(filepath: str) -> int:
    """Pass 1: upsert all distinct taxon rows. Returns count of taxa written."""
    idx          = _col_index(filepath)
    seen:set[int] = set()
    buf:list[dict] = []
    count        = 0

    def flush(cur) -> None:
        if buf:
            execute_batch(cur, _UPSERT_TAXON, buf)
            buf.clear()

    print("Pass 1/2 — upserting taxa ...")

    with open(filepath, encoding="utf-8") as f:
        f.readline()  # skip header
        with transaction() as cur:
            for line in f:
                cols = _parse_line(line)
                if not _is_target_row(cols, idx):
                    continue
                taxon = _parse_taxon(cols, idx)
                if taxon is None or taxon.taxon_key in seen:
                    continue
                seen.add(taxon.taxon_key)
                buf.append(taxon.__dict__)
                count += 1
                if len(buf) >= BATCH_SIZE:
                    flush(cur)
            flush(cur)

    print(f"  {count:,} taxa upserted.")
    return count


def _pass_occurrence(filepath: str) -> int:
    """Pass 2: upsert all occurrence rows. Returns count of occurrences written."""
    idx            = _col_index(filepath)
    buf:list[dict] = []
    count          = 0

    def flush(cur) -> None:
        if buf:
            execute_batch(cur, _UPSERT_OCCURRENCE, buf)
            buf.clear()

    print("Pass 2/2 — upserting occurrences ...")

    with open(filepath, encoding="utf-8") as f:
        f.readline()  # skip header
        with transaction() as cur:
            for line_num, line in enumerate(f, start=2):
                cols = _parse_line(line)
                if not _is_target_row(cols, idx):
                    continue
                occ = _parse_occurrence(cols, idx)
                if occ is None:
                    continue
                buf.append(occ.__dict__)
                count += 1
                if len(buf) >= BATCH_SIZE:
                    flush(cur)
                if line_num % 100_000 == 0:
                    print(f"  line {line_num:,}  |  occurrences: {count:,}")
            flush(cur)

    print(f"  {count:,} occurrences upserted.")
    return count


# ── Entry point ──────────────────────────────────────────────

def import_file(filepath: str) -> None:
    start = time.time()

    with transaction() as cur:
        create_schema(cur)
        cur.execute(
            "INSERT INTO gbif.sync_log (source, status) VALUES (%s, 'running') RETURNING id",
            (filepath,)
        )
        sync_id = cur.fetchone()[0]

    taxon_count      = _pass_taxon(filepath)       # ← pass 1: all taxa first
    occurrence_count = _pass_occurrence(filepath)  # ← pass 2: occurrences after

    elapsed = time.time() - start

    with transaction() as cur:
        cur.execute(
            """
            UPDATE gbif.sync_log
            SET finished_at   = now(),
                records_added = %s,
                status        = 'done'
            WHERE id = %s
            """,
            (occurrence_count, sync_id)
        )

    print(f"\nDone in {elapsed:.1f}s")
    print(f"  Taxa upserted:        {taxon_count:,}")
    print(f"  Occurrences upserted: {occurrence_count:,}")