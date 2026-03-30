Here are all 50 fields of the GBIF Simple CSV download:

---

## 識別子 / Identifiers

| # | Field name | Type | Nullable | Description |
|---|---|---|---|---|
| 1 | **gbifID** | String | No | Unique GBIF key for the occurrence. Same number as the URL on gbif.org. |
| 2 | **datasetKey** | String | No | UUID of the GBIF dataset containing this occurrence. |
| 3 | **occurrenceID** | String | Yes | Identifier for the occurrence as assigned by the data publisher. |

---

## 分類階層 / Taxonomy

| # | Field name | Type | Nullable | Description |
|---|---|---|---|---|
| 4 | **kingdom** | String | Yes | Kingdom name from the GBIF backbone taxonomy (e.g. `Fungi`). |
| 5 | **phylum** | String | Yes | Phylum name from the GBIF backbone taxonomy (e.g. `Basidiomycota`). |
| 6 | **class** | String | Yes | Class name from the GBIF backbone taxonomy (e.g. `Agaricomycetes`). |
| 7 | **order** | String | Yes | Order name from the GBIF backbone taxonomy (e.g. `Agaricales`). |
| 8 | **family** | String | Yes | Family name from the GBIF backbone taxonomy (e.g. `Amanitaceae`). |
| 9 | **genus** | String | Yes | Genus name from the GBIF backbone taxonomy (e.g. `Amanita`). |
| 10 | **species** | String | Yes | Species name excluding authorship (e.g. `Amanita muscaria`). |
| 11 | **infraspecificEpithet** | String | Yes | Infraspecific name part — subspecies, variety, etc. |
| 12 | **taxonRank** | String | Yes | Taxonomic rank of the most specific name identified (e.g. `SPECIES`, `GENUS`). |
| 13 | **scientificName** | String | Yes | Scientific name including authorship, from the GBIF backbone. May be a synonym — see also `acceptedScientificName`. |
| 14 | **verbatimScientificName** | String | Yes | Scientific name exactly as provided by the publisher, without GBIF interpretation. |
| 15 | **verbatimScientificNameAuthorship** | String | Yes | Authorship information exactly as provided by the publisher. |
| 16 | **taxonKey** | Integer | Yes | GBIF backbone key for the most specific taxon matched. May refer to a synonym. |
| 17 | **speciesKey** | Integer | Yes | GBIF backbone key at species level. Used for the vernacular name API call. |

---

## 場所 / Location

| # | Field name | Type | Nullable | Description |
|---|---|---|---|---|
| 18 | **countryCode** | String | Yes | ISO 3166-1 two-letter country code (e.g. `JP`). |
| 19 | **locality** | String | Yes | Free-text description of the specific place. May be inconsistent across records. |
| 20 | **stateProvince** | String | Yes | Next-smaller administrative region than country (prefecture level). Not altered by GBIF — expect inconsistent formatting. |
| 21 | **occurrenceStatus** | String | Yes | Whether the taxon was present or absent. Usually `PRESENT`. |
| 22 | **decimalLatitude** | Double | Yes | Geographic latitude in decimal degrees, WGS84 datum. |
| 23 | **decimalLongitude** | Double | Yes | Geographic longitude in decimal degrees, WGS84 datum. |
| 24 | **coordinateUncertaintyInMeters** | Double | Yes | Radius in metres of the smallest circle containing the recorded location. Often blank. |
| 25 | **coordinatePrecision** | Double | Yes | Decimal representation of coordinate precision. Often blank. |
| 26 | **elevation** | Double | Yes | Elevation in metres above sea level. |
| 27 | **elevationAccuracy** | Double | Yes | Potential error of the elevation value in metres. |
| 28 | **depth** | Double | Yes | Depth in metres below sea level. Usually blank for terrestrial species. |
| 29 | **depthAccuracy** | Double | Yes | Potential error of the depth value in metres. |

---

## 日時 / Date & Time

| # | Field name | Type | Nullable | Description |
|---|---|---|---|---|
| 30 | **eventDate** | String | Yes | Date and time the occurrence was recorded. ISO 8601 format. |
| 31 | **day** | Integer | Yes | Integer day of the month (1–31). |
| 32 | **month** | Integer | Yes | Integer month (1–12). |
| 33 | **year** | Integer | Yes | Four-digit year (Common Era calendar). |

---

## 個体・記録情報 / Occurrence Details

| # | Field name | Type | Nullable | Description |
|---|---|---|---|---|
| 34 | **individualCount** | Integer | Yes | Number of individuals present at the time of the occurrence. Often blank. |
| 35 | **basisOfRecord** | String | Yes | Nature of the evidence. Key values: `HUMAN_OBSERVATION`, `PRESERVED_SPECIMEN`, `MACHINE_OBSERVATION`. |
| 36 | **identifiedBy** | String | Yes | Name(s) of people who identified the taxon. Semicolon-delimited. |
| 37 | **dateIdentified** | ISO Date | Yes | Date the specimen or observation was identified to a taxon. |
| 38 | **recordedBy** | String | Yes | Name(s) of people who recorded the occurrence. Semicolon-delimited. |
| 39 | **typeStatus** | String | Yes | Nomenclatural type status (e.g. `HOLOTYPE`). Usually blank. |
| 40 | **establishmentMeans** | String | Yes | Whether the organism was introduced by humans. Values: `NATIVE`, `INTRODUCED`, `MANAGED`, etc. |

---

## データ管理・権利・品質 / Management, Rights & Quality

| # | Field name | Type | Nullable | Description |
|---|---|---|---|---|
| 41 | **publishingOrgKey** | String | Yes | GBIF UUID of the organization that published the dataset. |
| 42 | **institutionCode** | String | Yes | Acronym of the institution holding the specimen (e.g. `TNS` = National Museum of Nature and Science, Tokyo). |
| 43 | **collectionCode** | String | Yes | Name or acronym identifying the collection within the institution. |
| 44 | **catalogNumber** | String | Yes | Identifier for the record within the dataset or collection. |
| 45 | **recordNumber** | String | Yes | Identifier assigned by the collector at the time of recording (e.g. field notebook number). |
| 46 | **license** | String | Yes | License under which the record is published (e.g. `CC BY 4.0`). |
| 47 | **rightsHolder** | String | Yes | Person or organization owning rights over the record. |
| 48 | **mediaType** | String | Yes | Type of attached media. Values: `StillImage`, `MovingImage`, `Sound`. Semicolon-delimited. |
| 49 | **issue** | String | Yes | Data quality flags assigned by GBIF during processing (e.g. `COORDINATE_ROUNDED`, `TAXON_MATCH_FUZZY`). Semicolon-delimited. |
| 50 | **lastInterpreted** | ISO Date | Yes | Timestamp of the last time GBIF reprocessed this record. Changes when the taxonomy backbone or geographic data sources are updated. Useful for incremental sync. |