from .db import transaction

# ── Shape mappings ───────────────────────────────────────────
# Priority: family overrides order (more specific wins).
# Only families that deviate from their order's default need entries.

# Shape values must match your schema:
# Cap / Bracket / Coral / Tooth / Jelly / Cup / Puffball / Stinkhorn / Crust / Truffle

ORDER_SHAPE: dict[str, tuple[str, str]] = {
    # order_name: (shape, shape_ja)

    # ── Basidiomycota ────────────────────────────────────────
    "Agaricales":       ("Cap",      "傘型"),   # default: gilled cap mushrooms
    "Boletales":        ("Cap",      "傘型"),   # boletes are cap-shaped
    "Russulales":       ("Cap",      "傘型"),   # Russula/Lactarius etc.
    "Polyporales":      ("Bracket",  "多孔型"),
    "Hymenochaetales":  ("Bracket",  "多孔型"),
    "Corticiales":      ("Crust",    "皮型"),
    "Gloeophyllales":   ("Bracket",  "多孔型"),
    "Trechisporales":   ("Crust",    "皮型"),
    "Cantharellales":   ("Coral",    "珊瑚型"),  # chanterelles + coral fungi
    "Gomphales":        ("Coral",    "珊瑚型"),
    "Thelephorales":    ("Tooth",    "歯型"),
    "Auriculariales":   ("Jelly",    "ゼリー型"),
    "Tremellales":      ("Jelly",    "ゼリー型"),
    "Dacrymycetales":   ("Jelly",    "ゼリー型"),
    "Sebacinales":      ("Jelly",    "ゼリー型"),
    "Phallales":        ("Stinkhorn","スッポンタケ型"),
    "Geastrales":       ("Puffball", "腹菌型"),
    "Agaricostilbales": ("Crust",    "皮型"),

    # ── Ascomycota ───────────────────────────────────────────
    "Pezizales":        ("Cup",      "椀型"),   # cup fungi, morels, truffles
    "Helotiales":       ("Cup",      "椀型"),
    "Rhytismatales":    ("Cup",      "椀型"),
    "Hypocreales":      ("Crust",    "皮型"),
    "Xylariales":       ("Crust",    "皮型"),
    "Sordariales":      ("Crust",    "皮型"),
    "Pleosporales":     ("Crust",    "皮型"),
    "Boliniales":       ("Crust",    "皮型"),
    "Orbiliales":       ("Cup",      "椀型"),
    "Erysiphales":      ("Crust",    "皮型"),
    "Tuberales":        ("Truffle",  "トリュフ型"),

    # ── Basidiomycota: remaining orders ─────────────────────────
    # Smuts & rusts
    "Pucciniales":          ("Crust",    "皮型"),   # rust fungi (plant pathogens)
    "Ustilaginales":        ("Crust",    "皮型"),   # smut fungi
    "Urocystidales":        ("Crust",    "皮型"),   # smut fungi
    "Tilletiales":          ("Crust",    "皮型"),   # smut fungi
    "Microbotryales":       ("Crust",    "皮型"),   # smut-like
    "Entylomatales":        ("Crust",    "皮型"),   # smut fungi
    "Doassansiales":        ("Crust",    "皮型"),   # smut fungi
    "Georgefischeriales":   ("Crust",    "皮型"),
    "Kriegeriales":         ("Crust",    "皮型"),
    "Microstromatales":     ("Crust",    "皮型"),
    "Septobasidiales":      ("Crust",    "皮型"),   # scale insect parasites
    # Jelly / heterobasidiomycetes
    "Exobasidiales":        ("Jelly",    "ゼリー型"),  # plant-parasitic, jelly-like galls
    "Platygloeales":        ("Jelly",    "ゼリー型"),
    "Atractiellales":       ("Jelly",    "ゼリー型"),
    "Helicobasidiales":     ("Jelly",    "ゼリー型"),
    "Holtermanniales":      ("Jelly",    "ゼリー型"),
    "Unilacrymales":        ("Jelly",    "ゼリー型"),
    "Stereopsidales":       ("Jelly",    "ゼリー型"),
    "Spiculogloeales":      ("Jelly",    "ゼリー型"),
    "Heterogastridiales":   ("Jelly",    "ゼリー型"),
    "Tremellodendropsidales":("Jelly",   "ゼリー型"),
    "Mixiales":             ("Jelly",    "ゼリー型"),
    # Crust (corticioid / resupinate)
    "Amylocorticiales":     ("Crust",    "皮型"),
    "Atheliales":           ("Crust",    "皮型"),
    "Sistotremastrales":    ("Crust",    "皮型"),
    # Basidiomycota yeasts
    "Sporidiobolales":      ("Crust",    "皮型"),
    "Filobasidiales":       ("Crust",    "皮型"),
    "Cystofilobasidiales":  ("Crust",    "皮型"),
    "Cystobasidiales":      ("Crust",    "皮型"),
    "Trichosporonales":     ("Crust",    "皮型"),
    "Erythrobasidiales":    ("Crust",    "皮型"),
    "Malasseziales":        ("Crust",    "皮型"),
    "Leucosporidiales":     ("Crust",    "皮型"),
    "Sakaguchiales":        ("Crust",    "皮型"),
    "Wallemiales":          ("Crust",    "皮型"),
    "Moniliellales":        ("Crust",    "皮型"),
    "Buckleyzymales":       ("Crust",    "皮型"),
    "Geminibasidiales":     ("Crust",    "皮型"),
    "Orphellales":          ("Crust",    "皮型"),
    "Robbauerales":         ("Crust",    "皮型"),
    # Truffle-like Basidiomycota
    "Hysterangiales":       ("Truffle",  "トリュフ型"),

    # ── Ascomycota: remaining orders ────────────────────────────
    # Discomycetes with visible cup/club shapes
    "Geoglossales":         ("Cup",      "椀型"),   # earth tongues
    "Leotiales":            ("Cup",      "椀型"),   # small cup fungi
    "Thelebolales":         ("Cup",      "椀型"),   # tiny cup fungi
    "Hysteriales":          ("Cup",      "椀型"),   # elongated apothecia
    "Mytilinidiales":       ("Cup",      "椀型"),   # elongated apothecia
    "Neolectales":          ("Cup",      "椀型"),   # club-shaped
    "Phacidiales":          ("Cup",      "椀型"),   # small apothecia
    "Ostropales":           ("Cup",      "椀型"),   # small cup fungi
    "Gyalectales":          ("Cup",      "椀型"),
    "Schizosaccharomycetales": ("Crust", "皮型"),
    # Lichens (Lecanorales + lichen-forming orders)
    "Lecanorales":          ("Crust",    "皮型"),
    "Peltigerales":         ("Crust",    "皮型"),
    "Caliciales":           ("Crust",    "皮型"),
    "Pertusariales":        ("Crust",    "皮型"),
    "Teloschistales":       ("Crust",    "皮型"),
    "Arthoniales":          ("Crust",    "皮型"),
    "Umbilicariales":       ("Crust",    "皮型"),
    "Verrucariales":        ("Crust",    "皮型"),
    "Baeomycetales":        ("Crust",    "皮型"),
    "Pyrenulales":          ("Crust",    "皮型"),
    "Lecideales":           ("Crust",    "皮型"),
    "Lichinales":           ("Crust",    "皮型"),
    "Rhizocarpales":        ("Crust",    "皮型"),
    "Trypetheliales":       ("Crust",    "皮型"),
    "Strigulales":          ("Crust",    "皮型"),
    "Coniocybales":         ("Crust",    "皮型"),
    "Acarosporales":        ("Crust",    "皮型"),
    "Arctomiales":          ("Crust",    "皮型"),
    "Candelariales":        ("Crust",    "皮型"),
    "Mycocaliciales":       ("Crust",    "皮型"),
    "Sareales":             ("Crust",    "皮型"),
    "Schaereriales":        ("Crust",    "皮型"),
    "Thelocarpales":        ("Crust",    "皮型"),
    "Abrothallales":        ("Crust",    "皮型"),
    "Monoblepharidales":    ("Crust",    "皮型"),
    "Hymeneliales":         ("Crust",    "皮型"),
    "Sclerococcales":       ("Crust",    "皮型"),
    "Eremithallales":       ("Crust",    "皮型"),
    "Lichenoconiales":      ("Crust",    "皮型"),
    "Lichenostigmatales":   ("Crust",    "皮型"),
    "Monoblastiales":       ("Crust",    "皮型"),
    "Patellariales":        ("Crust",    "皮型"),
    # Ascomycota plant pathogens & saprobes
    "Mycosphaerellales":    ("Crust",    "皮型"),
    "Diaporthales":         ("Crust",    "皮型"),
    "Botryosphaeriales":    ("Crust",    "皮型"),
    "Amphisphaeriales":     ("Crust",    "皮型"),
    "Capnodiales":          ("Crust",    "皮型"),
    "Chaetosphaeriales":    ("Crust",    "皮型"),
    "Chaetothyriales":      ("Crust",    "皮型"),
    "Glomerellales":        ("Crust",    "皮型"),
    "Microascales":         ("Crust",    "皮型"),
    "Phyllachorales":       ("Crust",    "皮型"),
    "Dothideales":          ("Crust",    "皮型"),
    "Venturiales":          ("Crust",    "皮型"),
    "Magnaporthales":       ("Crust",    "皮型"),
    "Taphrinales":          ("Crust",    "皮型"),
    "Myriangiales":         ("Crust",    "皮型"),
    "Asterinales":          ("Crust",    "皮型"),
    "Coniochaetales":       ("Crust",    "皮型"),
    "Melanosporales":       ("Crust",    "皮型"),
    "Laboulbeniales":       ("Crust",    "皮型"),   # insect parasites
    "Ophiostomatales":      ("Crust",    "皮型"),
    "Tubeufiales":          ("Crust",    "皮型"),
    "Chaetomellales":       ("Crust",    "皮型"),
    "Coryneliales":         ("Crust",    "皮型"),
    "Coronophorales":       ("Crust",    "皮型"),
    "Meliolales":           ("Crust",    "皮型"),
    "Phomatosporales":      ("Crust",    "皮型"),
    "Pisorisporiales":      ("Crust",    "皮型"),
    "Savoryellales":        ("Crust",    "皮型"),
    "Trichosphaeriales":    ("Crust",    "皮型"),
    "Lulworthiales":        ("Crust",    "皮型"),
    "Calosphaeriales":      ("Crust",    "皮型"),
    "Amplistromatales":     ("Crust",    "皮型"),
    "Microthyriales":       ("Crust",    "皮型"),
    "Togniniales":          ("Crust",    "皮型"),
    "Conioscyphales":       ("Crust",    "皮型"),
    "Coniosporiales":       ("Crust",    "皮型"),
    "Cordanales":           ("Crust",    "皮型"),
    "Minutisphaerales":     ("Crust",    "皮型"),
    "Myrmecridiales":       ("Crust",    "皮型"),
    "Distoseptisporales":   ("Crust",    "皮型"),
    "Valsariales":          ("Crust",    "皮型"),
    "Torpedosporales":      ("Crust",    "皮型"),
    "Pleurotheciales":      ("Crust",    "皮型"),
    "Acrospermales":        ("Crust",    "皮型"),
    "Cancellidiales":       ("Crust",    "皮型"),
    "Lineolatales":         ("Crust",    "皮型"),
    "Lembosinales":         ("Crust",    "皮型"),
    "Phaeotrichales":       ("Crust",    "皮型"),
    "Muyocopronales":       ("Crust",    "皮型"),
    "Jahnulales":           ("Crust",    "皮型"),
    "Atractosporales":      ("Crust",    "皮型"),
    # Ascomycota yeasts
    "Saccharomycetales":    ("Crust",    "皮型"),
    "Eurotiales":           ("Crust",    "皮型"),   # Aspergillus, Penicillium
    "Onygenales":           ("Crust",    "皮型"),   # keratin-decomposing fungi
    "Ascosphaerales":       ("Crust",    "皮型"),
    # Truffle-like Ascomycota
    "Endogonales":          ("Truffle",  "トリュフ型"),

    # ── Fungi incertae sedis / other phyla ───────────────────────
    # Mucoromycota
    "Mucorales":            ("Crust",    "皮型"),   # bread molds
    "Mortierellales":       ("Crust",    "皮型"),
    "Kickxellales":         ("Crust",    "皮型"),
    "Zoopagales":           ("Crust",    "皮型"),
    "Harpellales":          ("Crust",    "皮型"),
    "Entomophthorales":     ("Crust",    "皮型"),   # insect-pathogenic molds
    "Basidiobolales":       ("Crust",    "皮型"),
    "Umbelopsidales":       ("Crust",    "皮型"),
    # Glomeromycota (mycorrhizal)
    "Glomerales":           ("Crust",    "皮型"),
    "Diversisporales":      ("Crust",    "皮型"),
    "Archaeosporales":      ("Crust",    "皮型"),
    "Paraglomerales":       ("Crust",    "皮型"),
    "Entrophosporales":     ("Crust",    "皮型"),
    "Calcarisporiellales":  ("Crust",    "皮型"),
    # Chytridiomycota (aquatic fungi)
    "Chytridiales":         ("Crust",    "皮型"),
    "Cladochytriales":      ("Crust",    "皮型"),
    "Rhizophydiales":       ("Crust",    "皮型"),
    "Rhizophlyctidales":    ("Crust",    "皮型"),
    "Spizellomycetales":    ("Crust",    "皮型"),
    "Lobulomycetales":      ("Crust",    "皮型"),
    "Physodermatales":      ("Crust",    "皮型"),
    "Olpidiales":           ("Crust",    "皮型"),
    "Blastocladiales":      ("Crust",    "皮型"),
    "Zygophlyctidales":     ("Crust",    "皮型"),
    # Entorrhizomycota
    "Entorrhizales":        ("Crust",    "皮型"),
    # Other / uncertain
    "Archaeorhizomycetales":("Crust",    "皮型"),
    "Tritirachiales":       ("Crust",    "皮型"),
    "Parasympodiellales":   ("Crust",    "皮型"),
    "Symbiotaphrinales":    ("Crust",    "皮型"),
    "Cephalothecales":      ("Crust",    "皮型"),
    "Wiesneriomycetales":   ("Crust",    "皮型"),
    "Lauriomycetales":      ("Crust",    "皮型"),
    "Lepidostromatales":    ("Crust",    "皮型"),
}

FAMILY_SHAPE: dict[str, tuple[str, str]] = {
    # Families that deviate from their order's default shape

    # Agaricales exceptions → non-cap shapes
    "Agaricaceae":      ("Cap",      "傘型"),   # includes Calvatia (puffball) and Lycoperdon
    "Lycoperdaceae":    ("Puffball", "腹菌型"),
    "Geastraceae":      ("Puffball", "腹菌型"),
    "Phallaceae":       ("Stinkhorn","スッポンタケ型"),
    "Clathraceae":      ("Stinkhorn","スッポンタケ型"),
    "Ramariaceae":      ("Coral",    "珊瑚型"),
    "Clavariaceae":     ("Coral",    "珊瑚型"),
    "Clavulinaceae":    ("Coral",    "珊瑚型"),
    "Typhulaceae":      ("Coral",    "珊瑚型"),
    "Sparassidaceae":   ("Coral",    "珊瑚型"),

    # Russulales exceptions → non-cap shapes
    "Hericiaceae":      ("Tooth",    "歯型"),
    "Bondarzewiaceae":  ("Bracket",  "多孔型"),
    "Auriscalpiaceae":  ("Tooth",    "歯型"),
    "Amylostereaceae":  ("Crust",    "皮型"),

    # Polyporales exceptions → non-bracket shapes
    "Meripilaceae":     ("Bracket",  "多孔型"),  # Grifola frondosa (Maitake)

    # Cantharellales → chanterelles are Cap, not Coral
    "Cantharellaceae":  ("Cap",      "傘型"),
    "Hydnaceae":        ("Tooth",    "歯型"),

    # Boletales exceptions
    "Sclerodermataceae":("Puffball", "腹菌型"),
    "Rhizopogonaceae":  ("Truffle",  "トリュフ型"),
    "Gautieriaceae":    ("Truffle",  "トリュフ型"),
    "Hysterangiaceae":  ("Stinkhorn","スッポンタケ型"),

    # Pezizales exceptions → truffles within a cup-fungi order
    "Tuberaceae":       ("Truffle",  "トリュフ型"),
    "Terfeziaceae":     ("Truffle",  "トリュフ型"),
    "Elaphomycetaceae": ("Truffle",  "トリュフ型"),
    "Morchellaceae":    ("Cup",      "椀型"),   # morels are cup-shaped
    "Helvellaceae":     ("Cup",      "椀型"),

    # Special genera handled via family
    "Bankeraceae":      ("Tooth",    "歯型"),
}

# Genera that need overriding even within a known family
# (rare cases where one genus in a family has a different shape)
GENUS_SHAPE: dict[str, tuple[str, str]] = {
    "Calvatia":     ("Puffball", "腹菌型"),  # in Agaricaceae
    "Lycoperdon":   ("Puffball", "腹菌型"),  # in Agaricaceae
    "Apioperdon":   ("Puffball", "腹菌型"),
    "Langermannia": ("Puffball", "腹菌型"),
    "Bovista":      ("Puffball", "腹菌型"),
    "Vascellum":    ("Puffball", "腹菌型"),
    "Handkea":      ("Puffball", "腹菌型"),
    "Geastrum":     ("Puffball", "腹菌型"),  # earthstars — in Geastraceae but double-confirm
    "Sparassis":    ("Coral",    "珊瑚型"),
    "Hericium":     ("Tooth",    "歯型"),
    "Hydnum":       ("Tooth",    "歯型"),
    "Sarcodon":     ("Tooth",    "歯型"),
    "Hydnellum":    ("Tooth",    "歯型"),
    "Phellodon":    ("Tooth",    "歯型"),
    "Bankera":      ("Tooth",    "歯型"),
    "Auricularia":  ("Jelly",    "ゼリー型"),
    "Tremella":     ("Jelly",    "ゼリー型"),
    "Calocera":     ("Jelly",    "ゼリー型"),
    "Dacryopinax":  ("Jelly",    "ゼリー型"),
    "Phallus":      ("Stinkhorn","スッポンタケ型"),
    "Mutinus":      ("Stinkhorn","スッポンタケ型"),
    "Dictyophora":  ("Stinkhorn","スッポンタケ型"),
    "Clathrus":     ("Stinkhorn","スッポンタケ型"),
    "Tuber":        ("Truffle",  "トリュフ型"),
    "Elaphomyces":  ("Truffle",  "トリュフ型"),
    "Cantharellus": ("Cap",      "傘型"),
    "Craterellus":  ("Cap",      "傘型"),
}


def fill_shape() -> None:
    """
    Populate shape and shape_ja on gbif.taxon using a three-level priority:
      1. Genus  (most specific)
      2. Family
      3. Order  (least specific / fallback)

    Safe to re-run — only updates rows where shape IS NULL.
    """
    with transaction() as cur:

        # ── Level 1: genus override ──────────────────────────
        genus_updated = 0
        for genus, (shape, shape_ja) in GENUS_SHAPE.items():
            cur.execute(
                """
                UPDATE gbif.taxon
                SET    shape    = %s,
                       shape_ja = %s
                WHERE  genus = %s
                  AND  shape IS NULL
                """,
                (shape, shape_ja, genus),
            )
            genus_updated += cur.rowcount
        print(f"  genus override:  {genus_updated:,} rows")

        # ── Level 2: family ──────────────────────────────────
        family_updated = 0
        for family, (shape, shape_ja) in FAMILY_SHAPE.items():
            cur.execute(
                """
                UPDATE gbif.taxon
                SET    shape    = %s,
                       shape_ja = %s
                WHERE  family = %s
                  AND  shape IS NULL
                """,
                (shape, shape_ja, family),
            )
            family_updated += cur.rowcount
        print(f"  family mapping:  {family_updated:,} rows")

        # ── Level 3: order fallback ──────────────────────────
        order_updated = 0
        for order, (shape, shape_ja) in ORDER_SHAPE.items():
            cur.execute(
                """
                UPDATE gbif.taxon
                SET    shape    = %s,
                       shape_ja = %s
                WHERE  "order" = %s
                  AND  shape IS NULL
                """,
                (shape, shape_ja, order),
            )
            order_updated += cur.rowcount
        print(f"  order fallback:  {order_updated:,} rows")

        # ── Level 4: catch-all for anything still NULL ───────────
        cur.execute(
            """
            UPDATE gbif.taxon
            SET    shape    = 'Crust',
                   shape_ja = '皮型'
            WHERE  shape IS NULL
            """
        )
        catchall_updated = cur.rowcount
        print(f"  catch-all:       {catchall_updated:,} rows")

        # ── Level 5: sync dominant shape → app public.Family ────
        cur.execute(
            """
            WITH dominant AS (
                SELECT DISTINCT ON (family)
                    family,
                    shape
                FROM gbif.taxon
                WHERE family IS NOT NULL
                  AND shape IS NOT NULL
                ORDER BY family,
                         COUNT(*) OVER (PARTITION BY family, shape) DESC
            )
            UPDATE "Family" f
            SET    shape_id = s.id
            FROM   dominant d
            JOIN   "Shape"  s ON s.name = d.shape
            WHERE  f.scientific_name = d.family
            """
        )
        app_families_updated = cur.rowcount
        print(f"  app families:    {app_families_updated:,} rows")

        # ── Summary ──────────────────────────────────────────
        cur.execute("SELECT COUNT(*) FROM gbif.taxon WHERE shape IS NULL")
        still_null = cur.fetchone()[0]

    total = genus_updated + family_updated + order_updated + catchall_updated
    print(f"\nShape filled for {total:,} taxa  (app families synced: {app_families_updated:,}).")
    if still_null:
        print(f"  WARNING: {still_null:,} taxa still have shape=NULL (unexpected)")