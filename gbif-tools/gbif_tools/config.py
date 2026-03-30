import os
from pathlib import Path
from dotenv import load_dotenv

def _find_and_load_env() -> Path | None:
    """
    Search for .env in this order:
      1. Current working directory         (where the user runs the command)
      2. Parent/parent of config.py        (project root when installed as a package)

    Returns the Path of the .env file that was loaded, or None.
    """
    candidates = [
        Path.cwd() / ".env",                               # 1. current dir
        Path(__file__).resolve().parent.parent.parent / ".env",   # 2. ../../../ of config.py
    ]

    for path in candidates:
        if path.exists():
            load_dotenv(path)
            return path

    return None

_loaded_from = _find_and_load_env()

if "DATABASE_URL" not in os.environ:
    searched = [
        str(Path.cwd() / ".env"),
        str(Path(__file__).resolve().parent.parent / ".env"),
    ]
    raise RuntimeError(
        "DATABASE_URL is not set.\n"
        "Searched for .env in:\n"
        + "\n".join(f"  {p}" for p in searched)
    )

DATABASE_URL = os.environ["DATABASE_URL"]
BATCH_SIZE   = 500
