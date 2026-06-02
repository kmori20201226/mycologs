import argparse
import sys

from . import download, list_taxa


def main() -> None:
    ap = argparse.ArgumentParser(
        prog="inat-images",
        description="iNaturalist image tools for mycologs.",
    )
    sub = ap.add_subparsers(dest="command", metavar="<command>")
    sub.required = True

    list_taxa.add_parser(sub)
    download.add_parser(sub)

    args = ap.parse_args()
    sys.exit(args.func(args))
