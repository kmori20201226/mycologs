#!/usr/bin/env python3
"""
post_moderator/moderator.py

CLI tool to experiment with AI-based post moderation.
Evaluates a user post and returns a structured judgment.

Usage:
    python moderator.py "Your post text here"
    python moderator.py --interactive
    python moderator.py --file posts.txt
"""

import argparse
import json
import os
import sys
import anthropic
from pathlib import Path

# ──────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────

REJECTION_CATEGORIES = {
    "OFFENSIVE_SEXUAL":       -5,
    "POTENTIALLY_OFFENSIVE":  -2,
    "OFF_TOPIC_IMAGE":        -1,
    "PASS":                    0,
}

ANSI = {
    "reset":  "\033[0m",
    "bold":   "\033[1m",
    "red":    "\033[91m",
    "yellow": "\033[93m",
    "green":  "\033[92m",
    "cyan":   "\033[96m",
    "gray":   "\033[90m",
    "blue":   "\033[94m",
}

def c(color: str, text: str) -> str:
    """Wrap text in ANSI color codes."""
    return f"{ANSI.get(color, '')}{text}{ANSI['reset']}"


# ──────────────────────────────────────────────
# Prompt
# ──────────────────────────────────────────────

SYSTEM_PROMPT = """
You are a content moderation AI for a mushroom & nature photography blog community.
Your role is to evaluate user posts and assign a moderation judgment.

## Site Context
- This is a blog about mushrooms, fungi, and ambient nature.
- Posts may include text and image descriptions.
- The community expects respectful, on-topic, nature-related content.

## Rejection Categories
Evaluate the post and assign ONE of the following categories:

| Category               | Points | Meaning                                                                 |
|------------------------|--------|-------------------------------------------------------------------------|
| OFFENSIVE_SEXUAL       |     -5 | Contains offensive, hateful, or sexual content. Post MUST be blocked.  |
| POTENTIALLY_OFFENSIVE  |     -2 | Arrogant, rude, or may make others feel uncomfortable. Post is shown with a warning. |
| OFF_TOPIC_IMAGE        |     -1 | Image or content is unrelated to mushrooms or ambient nature.           |
| PASS                   |      0 | Post is appropriate and on-topic. Approved.                             |

## Response Format
You MUST respond with a valid JSON object and nothing else. No prose, no markdown fences.

{
  "category":    "OFFENSIVE_SEXUAL | POTENTIALLY_OFFENSIVE | OFF_TOPIC_IMAGE | PASS",
  "point":       -5 | -2 | -1 | 0,
  "allowed":     true | false,
  "confidence":  0.0 to 1.0,
  "comment":     "Brief explanation of your judgment in 1-2 sentences."
}

Rules:
- `allowed` is false if category is OFFENSIVE_SEXUAL, true otherwise.
- `confidence` reflects how certain you are (1.0 = very certain, 0.5 = borderline).
- `comment` should explain your reasoning clearly so users understand the decision. **Always write `comment` in Japanese.**
- Be strict but fair. When borderline, prefer POTENTIALLY_OFFENSIVE over OFFENSIVE_SEXUAL.
- Posts will be written in Japanese. Evaluate them with full understanding of Japanese language nuance, slang, and cultural context.
""".strip()


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
            load_dotenv(path, override=True)
            return path

    return None

_loaded_from = _find_and_load_env()

if "ANTHROPIC_API_KEY" not in os.environ:
    print(
        "Warning: ANTHROPIC_API_KEY is not set. "
        "Vision-related functions will not work. "
        "Set ANTHROPIC_API_KEY in your .env file to use them."
    )

# ──────────────────────────────────────────────
# Core evaluation
# ──────────────────────────────────────────────

def evaluate_post(post_text: str, client: anthropic.Anthropic) -> dict:
    """Send post to Claude for moderation and return parsed result."""
    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": f"Evaluate this post:\n\n{post_text}"}
        ],
    )

    raw = message.content[0].text.strip()

    # Strip accidental markdown fences if present
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:])
    if raw.endswith("```"):
        raw = "\n".join(raw.split("\n")[:-1])

    result = json.loads(raw.strip())

    # Validate and normalize
    category = result.get("category", "PASS")
    if category not in REJECTION_CATEGORIES:
        category = "PASS"
    result["category"] = category
    result["point"]    = REJECTION_CATEGORIES[category]
    result["allowed"]  = category != "OFFENSIVE_SEXUAL"

    return result


# ──────────────────────────────────────────────
# Display
# ──────────────────────────────────────────────

CATEGORY_STYLE = {
    "OFFENSIVE_SEXUAL":       ("red",    "🚫 BLOCKED"),
    "POTENTIALLY_OFFENSIVE":  ("yellow", "⚠️  WARNING"),
    "OFF_TOPIC_IMAGE":        ("blue",   "📎 OFF-TOPIC"),
    "PASS":                   ("green",  "✅ APPROVED"),
}

def print_result(post_text: str, result: dict) -> None:
    """Pretty-print the moderation result."""
    category = result["category"]
    color, label = CATEGORY_STYLE.get(category, ("gray", "UNKNOWN"))
    points = result["point"]
    confidence = result.get("confidence", 0.0)
    comment = result.get("comment", "")

    width = 60
    print()
    print(c("bold", "─" * width))
    print(c("bold", " POST MODERATION RESULT"))
    print(c("bold", "─" * width))

    # Post preview
    preview = post_text if len(post_text) <= 80 else post_text[:77] + "..."
    print(c("gray", f" Post   : {preview}"))
    print()

    # Verdict
    print(f" Verdict: {c(color, c('bold', label))}")
    print(f" Category: {c(color, category)}")

    # Points
    if points < 0:
        print(f" Points : {c('red', str(points))}")
    else:
        print(f" Points : {c('green', '+0 (no deduction)')}")

    # Confidence bar
    bar_filled = int(confidence * 20)
    bar = "█" * bar_filled + "░" * (20 - bar_filled)
    pct = int(confidence * 100)
    print(f" Confidence: [{c('cyan', bar)}] {pct}%")

    # AI comment
    print()
    print(c("bold", " AI Comment:"))
    print(f"   {comment}")
    print(c("bold", "─" * width))
    print()


# ──────────────────────────────────────────────
# CLI modes
# ──────────────────────────────────────────────

def run_single(post_text: str, client: anthropic.Anthropic) -> None:
    print(c("gray", "  Evaluating post..."), end="\r")
    result = evaluate_post(post_text, client)
    print_result(post_text, result)


def run_interactive(client: anthropic.Anthropic) -> None:
    print(c("bold", "\n🍄 Post Moderator — Interactive Mode"))
    print(c("gray", "   Type your post and press Enter. Ctrl+C or 'quit' to exit.\n"))

    while True:
        try:
            post = input(c("cyan", "Post> ")).strip()
        except (KeyboardInterrupt, EOFError):
            print(c("gray", "\nBye!"))
            break

        if not post:
            continue
        if post.lower() in ("quit", "exit", "q"):
            print(c("gray", "Bye!"))
            break

        print(c("gray", "  Evaluating..."), end="\r")
        try:
            result = evaluate_post(post, client)
            print_result(post, result)
        except json.JSONDecodeError as e:
            print(c("red", f"  [Error] Could not parse AI response: {e}"))
        except anthropic.APIError as e:
            print(c("red", f"  [API Error] {e}"))


def run_file(filepath: str, client: anthropic.Anthropic) -> None:
    """Read posts from a file (one per line) and evaluate each."""
    if not os.path.exists(filepath):
        print(c("red", f"File not found: {filepath}"))
        sys.exit(1)

    with open(filepath, encoding="utf-8") as f:
        lines = [l.strip() for l in f if l.strip()]

    print(c("bold", f"\n🍄 Evaluating {len(lines)} post(s) from: {filepath}"))

    for i, post in enumerate(lines, 1):
        print(c("gray", f"  [{i}/{len(lines)}] Evaluating..."), end="\r")
        try:
            result = evaluate_post(post, client)
            print_result(post, result)
        except (json.JSONDecodeError, anthropic.APIError) as e:
            print(c("red", f"  [Error on post {i}] {e}"))


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="🍄 AI Post Moderator — Evaluate blog posts for policy compliance.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python moderator.py "I found a beautiful Amanita muscaria today!"
  python moderator.py --interactive
  python moderator.py --file sample_posts.txt
        """,
    )

    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "post",
        nargs="?",
        help="Post text to evaluate (quoted string)",
    )
    group.add_argument(
        "-i", "--interactive",
        action="store_true",
        help="Start interactive REPL mode",
    )
    group.add_argument(
        "-f", "--file",
        metavar="FILE",
        help="Path to a text file with one post per line",
    )

    args = parser.parse_args()

    # Require at least one mode
    if not args.post and not args.interactive and not args.file:
        parser.print_help()
        sys.exit(0)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print(c("red", "[Error] ANTHROPIC_API_KEY environment variable is not set."))
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    if args.interactive:
        run_interactive(client)
    elif args.file:
        run_file(args.file, client)
    else:
        run_single(args.post, client)


if __name__ == "__main__":
    main()
