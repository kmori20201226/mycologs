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

        # ── Summary ──────────────────────────────────────────
        cur.execute("SELECT COUNT(*) FROM gbif.taxon WHERE shape IS NULL")
        still_null = cur.fetchone()[0]

    total = genus_updated + family_updated + order_updated
    print(f"\nShape filled for {total:,} taxa.")
    if still_null:
        print(
            f"  {still_null:,} taxa still have shape=NULL "
            f"(order/family not in mapping — check with: "
            f'SELECT "order", family, COUNT(*) FROM gbif.taxon '
            f'WHERE shape IS NULL GROUP BY "order", family ORDER BY COUNT(*) DESC)'
        )