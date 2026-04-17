SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS gbif;

CREATE TABLE IF NOT EXISTS gbif.taxon (
    taxon_key               INTEGER         PRIMARY KEY,
    species_key             INTEGER,
    kingdom                 TEXT,
    phylum                  TEXT,
    class                   TEXT,
    "order"                 TEXT,
    family                  TEXT,
    genus                   TEXT,
    species                 TEXT,
    infraspecific_epithet   TEXT,
    taxon_rank              TEXT,
    scientific_name         TEXT,
    taxonomic_status        TEXT,
    japanese_name           TEXT,
    kingdom_ja              TEXT,
    phylum_ja               TEXT,
    class_ja                TEXT,
    order_ja                TEXT,
    family_ja               TEXT,
    genus_ja                TEXT,
    shape                   TEXT,
    shape_ja                TEXT,
    edibility               TEXT,
    edibility_ja            TEXT,
    occurrence_score        INTEGER         DEFAULT 0,
    last_synced_at          TIMESTAMPTZ     DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gbif.occurrence (
    gbif_id                             BIGINT          PRIMARY KEY,
    occurrence_id                       TEXT,
    dataset_key                         TEXT,
    taxon_key                           INTEGER         REFERENCES gbif.taxon (taxon_key),
    verbatim_scientific_name            TEXT,
    verbatim_scientific_name_authorship TEXT,
    country_code                        CHAR(2),
    state_province                      TEXT,
    locality                            TEXT,
    decimal_latitude                    DOUBLE PRECISION,
    decimal_longitude                   DOUBLE PRECISION,
    coordinate_uncertainty_m            DOUBLE PRECISION,
    coordinate_precision                DOUBLE PRECISION,
    elevation_m                         DOUBLE PRECISION,
    elevation_accuracy_m                DOUBLE PRECISION,
    event_date                          TEXT,
    year                                SMALLINT,
    month                               SMALLINT,
    day                                 SMALLINT,
    occurrence_status                   TEXT,
    individual_count                    INTEGER,
    basis_of_record                     TEXT,
    identified_by                       TEXT,
    date_identified                     TEXT,
    recorded_by                         TEXT,
    type_status                         TEXT,
    establishment_means                 TEXT,
    institution_code                    TEXT,
    collection_code                     TEXT,
    catalog_number                      TEXT,
    record_number                       TEXT,
    license                             TEXT,
    rights_holder                       TEXT,
    media_type                          TEXT,
    issue                               TEXT,
    last_interpreted                    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gbif.sync_log (
    id              SERIAL          PRIMARY KEY,
    started_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    source          TEXT            NOT NULL,
    records_added   INTEGER         DEFAULT 0,
    records_updated INTEGER         DEFAULT 0,
    status          TEXT            DEFAULT 'running'
);

-- Indexes (CREATE INDEX IF NOT EXISTS is safe to re-run)
CREATE INDEX IF NOT EXISTS idx_gbif_taxon_species_key  ON gbif.taxon (species_key);
CREATE INDEX IF NOT EXISTS idx_gbif_taxon_family       ON gbif.taxon (family);
CREATE INDEX IF NOT EXISTS idx_gbif_taxon_genus        ON gbif.taxon (genus);
CREATE INDEX IF NOT EXISTS idx_gbif_occurrence_taxon   ON gbif.occurrence (taxon_key);
CREATE INDEX IF NOT EXISTS idx_gbif_occurrence_dataset ON gbif.occurrence (dataset_key);
CREATE INDEX IF NOT EXISTS idx_gbif_occurrence_country ON gbif.occurrence (country_code);
CREATE INDEX IF NOT EXISTS idx_gbif_occurrence_year    ON gbif.occurrence (year);
CREATE INDEX IF NOT EXISTS idx_gbif_occurrence_basis   ON gbif.occurrence (basis_of_record);
CREATE INDEX IF NOT EXISTS idx_gbif_occurrence_lat_lon ON gbif.occurrence (decimal_latitude, decimal_longitude);
CREATE INDEX IF NOT EXISTS idx_gbif_occurrence_interp  ON gbif.occurrence (last_interpreted);
"""

def create_schema(cur):
    cur.execute(SCHEMA_SQL)
    print("Schema ready.")
