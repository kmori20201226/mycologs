import argparse
import sys


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

    # ── parse ────────────────────────────────────────────────
    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    args.func(args)