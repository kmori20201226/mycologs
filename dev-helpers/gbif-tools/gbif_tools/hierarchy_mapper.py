from .db import transaction

KINGDOM_JA = {"Fungi": "菌界"}
PHYLUM_JA  = {"Basidiomycota": "担子菌門", "Ascomycota": "子嚢菌門"}
CLASS_JA   = {
    "Agaricomycetes": "ハラタケ綱", "Dacrymycetes": "アカキクラゲ綱",
    "Tremellomycetes": "シロキクラゲ綱", "Pezizomycetes": "チャワンタケ綱",
    "Sordariomycetes": "フンタマカビ綱", "Leotiomycetes": "レオチオミセス綱",
}
ORDER_JA   = {
    "Agaricales": "ハラタケ目", "Boletales": "イグチ目",
    "Russulales": "ベニタケ目", "Polyporales": "タコウキン目",
    "Cantharellales": "アンズタケ目", "Auriculariales": "キクラゲ目",
    "Tremellales": "シロキクラゲ目", "Dacrymycetales": "アカキクラゲ目",
    "Pezizales": "チャワンタケ目", "Hypocreales": "ニクザキン目",
    "Phallales": "スッポンタケ目", "Geastrales": "ツチグリ目",
    "Hymenochaetales": "サビアナタケ目", "Thelephorales": "テレフォラレス目",
    "Gomphales": "ホウキタケ目",
}
FAMILY_JA  = {
    "Amanitaceae": "テングタケ科", "Agaricaceae": "ハラタケ科",
    "Tricholomataceae": "キシメジ科", "Lyophyllaceae": "シメジ科",
    "Marasmiaceae": "オキナタケ科", "Physalacriaceae": "モエギタケ科",
    "Pleurotaceae": "ヒラタケ科", "Strophariaceae": "モエギタケ科",
    "Entolomataceae": "イッポンシメジ科", "Cortinariaceae": "フウセンタケ科",
    "Inocybaceae": "アセタケ科", "Psathyrellaceae": "ナヨタケ科",
    "Omphalotaceae": "ツキヨタケ科", "Russulaceae": "ベニタケ科",
    "Boletaceae": "イグチ科", "Suillaceae": "ヌメリイグチ科",
    "Polyporaceae": "タコウキン科", "Meripilaceae": "マイタケ科",
    "Fomitopsidaceae": "サルノコシカケ科", "Sparassidaceae": "シロアミタケ科",
    "Cantharellaceae": "アンズタケ科", "Hydnaceae": "ヒダナシタケ科",
    "Clavulinaceae": "エセオリミキ科", "Clavariaceae": "シロソウメンタケ科",
    "Auriculariaceae": "キクラゲ科", "Tremellaceae": "シロキクラゲ科",
    "Dacrymycetaceae": "アカキクラゲ科", "Morchellaceae": "アミガサタケ科",
    "Helvellaceae": "シャグマアミガサタケ科", "Pezizaceae": "チャワンタケ科",
    "Sarcoscyphaceae": "サカズキキン科", "Phallaceae": "スッポンタケ科",
    "Geastraceae": "ツチグリ科", "Hericiaceae": "サンゴハリタケ科",
    "Ramariaceae": "ホウキタケ科", "Bankeraceae": "ニセショウロ科",
    "Hymenochaetaceae": "サビアナタケ科",
}
GENUS_JA   = {
    "Amanita": "テングタケ属", "Tricholoma": "キシメジ属",
    "Lyophyllum": "シメジ属", "Hypsizygus": "ブナシメジ属",
    "Lentinula": "シイタケ属", "Flammulina": "エノキタケ属",
    "Armillaria": "ナラタケ属", "Pleurotus": "ヒラタケ属",
    "Pholiota": "ナメコ属", "Hypholoma": "クリタケ属",
    "Entoloma": "イッポンシメジ属", "Cortinarius": "フウセンタケ属",
    "Inocybe": "アセタケ属", "Agaricus": "ハラタケ属",
    "Macrolepiota": "オニカラカサタケ属", "Calvatia": "オニフスベ属",
    "Lycoperdon": "ホコリタケ属", "Coprinus": "ヒトヨタケ属",
    "Coprinopsis": "ヒトヨタケ属", "Russula": "ベニタケ属",
    "Lactarius": "チチタケ属", "Boletus": "ヤマドリタケ属",
    "Suillus": "ヌメリイグチ属", "Tylopilus": "ニガイグチ属",
    "Ganoderma": "マンネンタケ属", "Trametes": "カワラタケ属",
    "Grifola": "マイタケ属", "Laetiporus": "ニワトリタケ属",
    "Sparassis": "ハナビラタケ属", "Cantharellus": "アンズタケ属",
    "Craterellus": "クロラッパタケ属", "Hericium": "サンゴハリタケ属",
    "Auricularia": "キクラゲ属", "Tremella": "シロキクラゲ属",
    "Morchella": "アミガサタケ属", "Phallus": "スッポンタケ属",
    "Geastrum": "ツチグリ属",
}

def fill_hierarchy_ja() -> None:
    """
    Populate *_ja columns on gbif.taxon from the static mapping dictionaries.
    Safe to re-run: uses UPDATE ... WHERE column IS NULL so already-filled
    rows are not overwritten.
    """
    mappings = [
        ("kingdom_ja", "kingdom", KINGDOM_JA),
        ("phylum_ja",  "phylum",  PHYLUM_JA),
        ("class_ja",   "class",   CLASS_JA),
        ("order_ja",   '"order"', ORDER_JA),
        ("family_ja",  "family",  FAMILY_JA),
        ("genus_ja",   "genus",   GENUS_JA),
    ]

    with transaction() as cur:
        for ja_col, en_col, mapping in mappings:
            updated_total = 0
            for en_name, ja_name in mapping.items():
                cur.execute(
                    f"""
                    UPDATE gbif.taxon
                    SET    {ja_col} = %s
                    WHERE  {en_col} = %s
                      AND  {ja_col} IS NULL
                    """,
                    (ja_name, en_name)
                )
                updated_total += cur.rowcount
            print(f"  {ja_col}: {updated_total:,} rows updated")

    print("Hierarchy Japanese names filled.")