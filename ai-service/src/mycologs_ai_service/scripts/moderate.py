#!/usr/bin/env python3
"""
blog_ai_service/scripts/moderate.py

CLI tool to invoke the moderation API.
Mirrors the original moderator.py interface, but calls the HTTP service
instead of the Anthropic API directly.

Usage (after pip install):
    moderate "Your post text here"
    moderate --interactive
    moderate --file posts.txt
    moderate --url http://localhost:9000 "Your post text here"
"""

import argparse
import os
import sys
import urllib.request
import urllib.error
import json


# ──────────────────────────────────────────────
# ANSI helpers
# ──────────────────────────────────────────────

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
    return f"{ANSI.get(color, '')}{text}{ANSI['reset']}"


# ──────────────────────────────────────────────
# API call
# ──────────────────────────────────────────────

def call_api(post: str, base_url: str) -> dict:
    """POST to /api/moderation/evaluate and return the parsed result."""
    url = f"{base_url.rstrip('/')}/api/moderation/evaluate"
    payload = json.dumps({"post": post}).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(body).get("detail", body)
        except json.JSONDecodeError:
            detail = body
        raise RuntimeError(f"HTTP {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"Could not reach service at {base_url!r} — is it running?\n  {e.reason}"
        ) from e


# ──────────────────────────────────────────────
# Display
# ──────────────────────────────────────────────

CATEGORY_STYLE = {
    "OFFENSIVE_SEXUAL":      ("red",    "🚫 BLOCKED"),
    "POTENTIALLY_OFFENSIVE": ("yellow", "⚠️  WARNING"),
    "OFF_TOPIC_IMAGE":       ("blue",   "📎 OFF-TOPIC"),
    "PASS":                  ("green",  "✅ APPROVED"),
}

def print_result(post: str, result: dict) -> None:
    category   = result.get("category", "PASS")
    color, label = CATEGORY_STYLE.get(category, ("gray", "UNKNOWN"))
    points     = result.get("point", 0)
    confidence = result.get("confidence", 0.0)
    comment    = result.get("comment", "")

    width = 60
    print()
    print(c("bold", "─" * width))
    print(c("bold", " POST MODERATION RESULT"))
    print(c("bold", "─" * width))

    preview = post if len(post) <= 80 else post[:77] + "..."
    print(c("gray", f" Post   : {preview}"))
    print()

    print(f" Verdict : {c(color, c('bold', label))}")
    print(f" Category: {c(color, category)}")

    if points < 0:
        print(f" Points  : {c('red', str(points))}")
    else:
        print(f" Points  : {c('green', '+0 (no deduction)')}")

    bar_filled = int(confidence * 20)
    bar = "█" * bar_filled + "░" * (20 - bar_filled)
    pct = int(confidence * 100)
    print(f" Confidence: [{c('cyan', bar)}] {pct}%")

    print()
    print(c("bold", " AI Comment:"))
    print(f"   {comment}")
    print(c("bold", "─" * width))
    print()


# ──────────────────────────────────────────────
# CLI modes
# ──────────────────────────────────────────────

def run_single(post: str, base_url: str) -> None:
    print(c("gray", "  Evaluating post..."), end="\r")
    result = call_api(post, base_url)
    print_result(post, result)

def _read_multiline(prompt_first: str, prompt_cont: str) -> str | None:
    """
    Collect lines until the user enters a blank line.
    Returns the joined text, or None if the user wants to quit/exit.
    Raises EOFError / KeyboardInterrupt to propagate Ctrl-D / Ctrl-C.
    """
    lines: list[str] = []
    prompt = prompt_first
 
    while True:
        line = input(prompt)      # may raise KeyboardInterrupt / EOFError
        prompt = prompt_cont      # switch to continuation prompt after first line
 
        if not line:
            # Empty line — treat as submit if we have content, else ignore
            if lines:
                break
            continue
 
        if not lines and line.strip().lower() in ("quit", "exit", "q"):
            return None
 
        lines.append(line)
 
    return "\n".join(lines).strip()
 
 
def run_interactive(base_url: str) -> None:
    print(c("bold", "\n🍄 Post Moderator — Interactive Mode"))
    print(c("gray", f"   Service: {base_url}"))
    print(c("gray", "   Enter your post (multiple lines OK). Blank line to submit."))
    print(c("gray", "   Ctrl+C or \'quit\' to exit.\n"))
 
    while True:
        try:
            post = _read_multiline(
                prompt_first=c("cyan", "Post> "),
                prompt_cont =c("cyan", "    > "),
            )
        except (KeyboardInterrupt, EOFError):
            print(c("gray", "\nBye!"))
            break
 
        if post is None:          # user typed quit/exit
            print(c("gray", "Bye!"))
            break
 
        print(c("gray", "  Evaluating..."), end="\r")
        try:
            result = call_api(post, base_url)
            print_result(post, result)
        except RuntimeError as e:
            print(c("red", f"  [Error] {e}"))
 
 
 
def run_file(filepath: str, base_url: str) -> None:
    if not os.path.exists(filepath):
        print(c("red", f"File not found: {filepath}"))
        sys.exit(1)
 
    with open(filepath, encoding="utf-8") as f:
        lines = [l.strip() for l in f if l.strip()]
 
    print(c("bold", f"\n🍄 Evaluating {len(lines)} post(s) from: {filepath}"))
 
    for i, post in enumerate(lines, 1):
        print(c("gray", f"  [{i}/{len(lines)}] Evaluating..."), end="\r")
        try:
            result = call_api(post, base_url)
            print_result(post, result)
        except RuntimeError as e:
            print(c("red", f"  [Error on post {i}] {e}"))
 
# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

DEFAULT_URL = os.environ.get("BLOG_AI_SERVICE_URL", "http://localhost:3002")

def main():
    parser = argparse.ArgumentParser(
        description="🍄 Post Moderator CLI — calls the blog-ai-service API.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  moderate "I found a beautiful Amanita muscaria today!"
  moderate --interactive
  moderate --file sample_posts.txt
  moderate --url http://staging.example.com "Test post"

The service URL can also be set via the BLOG_AI_SERVICE_URL environment variable.
        """,
    )

    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        metavar="URL",
        help=f"Base URL of the AI service (default: {DEFAULT_URL})",
    )

    group = parser.add_mutually_exclusive_group()
    group.add_argument("post",          nargs="?",            help="Post text to evaluate")
    group.add_argument("-i", "--interactive", action="store_true", help="Interactive REPL mode")
    group.add_argument("-f", "--file",   metavar="FILE",       help="File with one post per line")

    args = parser.parse_args()

    if not args.post and not args.interactive and not args.file:
        parser.print_help()
        sys.exit(0)

    if args.interactive:
        run_interactive(args.url)
    elif args.file:
        run_file(args.file, args.url)
    else:
        run_single(args.post, args.url)


if __name__ == "__main__":
    main()