import argparse
import sys
from pathlib import Path

def _cmd_import(args: argparse.Namespace) -> None:
    from .importer import import_file
    import_file(args.file)


def _cmd_fill_japanese(args: argparse.Namespace) -> None:
    from .hierarchy_mapper import fill_hierarchy_ja
    from .name_fetcher import fetch_names
    fill_hierarchy_ja()
    fetch_names()


def _cmd_create_schema(args: argparse.Namespace) -> None:
    from .db import transaction
    from .schema import create_schema
    with transaction() as cur:
        create_schema(cur)

def _cmd_fill_shape(args: argparse.Namespace) -> None:
    from .shape_mapper import fill_shape
    print("Filling shape from taxonomy mapping ...")
    fill_shape()

def _cmd_import_katumoto(args: argparse.Namespace) -> None:
    from .katumoto_name_importer import import_katumoto_names
    import_katumoto_names(
        xlsx_path=args.xlsx,
        genus_fallback=args.genus_fallback,
        overwrite=args.overwrite,
    )

def _cmd_import_supplement(args: argparse.Namespace) -> None:
    from pathlib import Path
    from .katumoto_supplement_importer import import_supplement_names
    import_supplement_names(
        xlsx_path=Path(args.xlsx),
        genus_fallback=args.genus_fallback,
        overwrite=args.overwrite,
    )

def _cmd_extract_synonyms(args: argparse.Namespace) -> None:
    from pathlib import Path
    from .synonym_extractor import extract_synonyms
    extract_synonyms(
        output_path=Path(args.output),
        limit=args.limit,
        resume=args.resume,
    )


def _cmd_identify(args: argparse.Namespace) -> None:
    import json
    from .vision import identify_mushroom
    result = identify_mushroom(
        image_paths=args.images,
        lat=args.lat,
        lon=args.lon,
        model=args.model,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


DATADIR = Path(__file__).parent / "data"

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="gbif",
        description="Toolset for processing and storing GBIF occurrence data.",
    )

    subparsers = parser.add_subparsers(
        title="commands",
        dest="command",
        metavar="<command>",
    )

    # ── gbif create-schema ───────────────────────────────────
    subparsers.add_parser(
        "create-schema",
        help="Create the gbif schema and tables in the database.",
        description="Create gbif.taxon, gbif.occurrence, and gbif.sync_log if they do not exist.",
    ).set_defaults(func=_cmd_create_schema)

    # ── gbif import ──────────────────────────────────────────
    import_parser = subparsers.add_parser(
        "import",
        help="Stream a GBIF Simple CSV into the database.",
        description="Stream a GBIF Simple CSV (TSV) file into gbif.taxon and gbif.occurrence.",
    )
    import_parser.add_argument(
        "file",
        metavar="<path/to/gbif_download.tsv>",
        help="Path to the GBIF Simple CSV download file.",
    )
    import_parser.set_defaults(func=_cmd_import)

    # ── gbif fill-japanese ───────────────────────────────────
    subparsers.add_parser(
        "fill-japanese",
        help="Fill Japanese names on gbif.taxon (hierarchy mapping + GBIF API).",
        description=(
            "Two-step process:\n"
            "  1. Fill kingdom_ja … genus_ja from static mapping dictionaries.\n"
            "  2. Fetch japanese_name from the GBIF vernacularNames API.\n"
            "Safe to re-run — only processes rows where the value is still NULL."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    ).set_defaults(func=_cmd_fill_japanese)

    # ── gbif fill-shape ───────────────────────────────────────
    subparsers.add_parser(
        "fill-shape",
        help="Fill shape and shape_ja on gbif.taxon from taxonomy mapping.",
        description=(
            "Infers fruiting body shape from order → family → genus, "
            "in that priority order. Safe to re-run."
        ),
    ).set_defaults(func=_cmd_fill_shape)

    # ── gbif import-katumoto ──────────────────────────────── 
 
    k_parser = subparsers.add_parser(
        "import-katumoto",
        help="Import Japanese names from the MSJ Katumoto wamei Excel file.",
        description=(
            "Source: https://www.mycology-jp.org/html/checklist_wlist.html\n"
            "License: CC BY 4.0 — 日本菌学会データベース委員会"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    k_parser.add_argument("--xlsx", metavar="<Katumoto-Wamei.xlsx>",
        default=DATADIR / "Katumoto-Wamei.xlsx",
        help="Path to the downloaded Excel file.")
    k_parser.add_argument("--genus-fallback", action="store_true",
        help="Also fill NULL rows where only genus matches.")
    k_parser.add_argument("--overwrite", action="store_true",
        help="Overwrite existing names (default: only fill NULL rows).")
    k_parser.set_defaults(func=_cmd_import_katumoto)

    # ── gbif import-katumoto-supplement ─────────────────────────

    sup_parser = subparsers.add_parser(
        "import-katumoto-supplement",
        help="Import Japanese names from the MSJ post-2008 supplement Excel file.",
        description=(
            "Source: https://www.mycology-jp.org/html/checklist.html\n"
            "License: CC BY 4.0 — 日本菌学会データベース委員会"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sup_parser.add_argument("--xlsx", metavar="<DB20200311.xlsx>",
        default=DATADIR / "DB20200311.xlsx",
        help="Path to the supplement Excel file.")
    sup_parser.add_argument("--genus-fallback", action="store_true",
        help="Also fill NULL rows where only genus matches.")
    sup_parser.add_argument("--overwrite", action="store_true",
        help="Overwrite existing names (default: only fill NULL rows).")
    sup_parser.set_defaults(func=_cmd_import_supplement)

    # ── gbif extract-synonyms ────────────────────────────────
    syn_parser = subparsers.add_parser(
        "extract-synonyms",
        help="Extract all Japanese name synonyms for each taxon to a CSV file.",
        description=(
            "Queries Wikipedia, iNaturalist, and GBIF vernacularNames for every\n"
            "taxon in gbif.taxon and writes all found Japanese names to a CSV.\n"
            "Output columns: taxon_key, species_key, scientific_name, source, name\n"
            "Sources: db (current stored value), wikipedia, inat, gbif\n"
            "\n"
            "Progress is logged periodically (count, %, ETA). Use --resume to\n"
            "continue an interrupted run; a sidecar '<output>.progress' file\n"
            "tracks completed taxa so they are not re-queried."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    syn_parser.add_argument(
        "--output", metavar="<file.csv>",
        default="synonyms.csv",
        help="Path to the output CSV file (default: synonyms.csv).",
    )
    syn_parser.add_argument(
        "--limit", metavar="N",
        type=int,
        default=None,
        help="Process at most N taxa (useful for testing).",
    )
    syn_parser.add_argument(
        "--resume", action="store_true",
        help="Skip taxa already recorded in <output>.progress and append.",
    )
    syn_parser.set_defaults(func=_cmd_extract_synonyms)

    #
    identify_parser = subparsers.add_parser(
        "identify",
        help="Identify a mushroom from a photo using Claude Vision.",
    )
    identify_parser.add_argument(
        "images",
        metavar="<image>",
        nargs="+",
        help="Path to mushroom images (JPEG, PNG, GIF, WebP).",
    )
    identify_parser.add_argument(
        "--lat", type=float, default=None,
        help="Latitude where photo was taken (improves accuracy).",
    )
    identify_parser.add_argument(
        "--lon", type=float, default=None,
        help="Longitude where photo was taken (improves accuracy).",
    )
    identify_parser.add_argument(
        "--model", default="claude-sonnet-4-6",
        help="Claude model to use (default: claude-sonnet-4-6).",
    )
    identify_parser.set_defaults(func=_cmd_identify)

    # ── parse ────────────────────────────────────────────────

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    args.func(args)