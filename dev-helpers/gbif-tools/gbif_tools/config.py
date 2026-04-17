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
        Path(__file__).resolve().parent.parent.parent.parent / ".env",   # 2. ../../../../ of config.py
    ]

    for path in candidates:
        if path.exists():
            load_dotenv(path, override=True)
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

if "ANTHROPIC_API_KEY" not in os.environ:
    print(
        "Warning: ANTHROPIC_API_KEY is not set. "
        "Vision-related functions will not work. "
        "Set ANTHROPIC_API_KEY in your .env file to use them."
    )
DATABASE_URL = os.environ["DATABASE_URL"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")  # Optional, only needed for vision.py

BATCH_SIZE   = 500
