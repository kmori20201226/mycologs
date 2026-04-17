import base64
import json
import os
from pathlib import Path
import anthropic
from io import BytesIO
from PIL import Image

# Supported image formats
MEDIA_TYPES = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".gif":  "image/gif",
    ".webp": "image/webp",
}

# ── System prompt ────────────────────────────────────────────
# Placed in the system field so it doesn't consume the image
# token budget and is consistent across all requests.
_SYSTEM_PROMPT = """\
You are a mycologist specialising in Japanese fungi.
When given a mushroom photo, respond ONLY with a JSON object —
no markdown fences, no preamble, no explanation outside the JSON.

Required keys:
  scientific_name   string   Best-guess binomial (e.g. "Amanita muscaria")
  japanese_name     string   Standard Japanese name in katakana/kanji, or ""
  confidence        string   One of: "high", "medium", "low"
  shape             string   One of: Cap, Bracket, Coral, Tooth, Jelly, Cup,
                             Puffball, Stinkhorn, Crust, Truffle
  edibility         string   One of: edible, toxic, inedible, unknown
  key_features      list     2–4 visual features that led to this identification
  similar_species   list     0–2 species that could be confused with this one
  disclaimer        string   Always include a safety disclaimer about not
                             relying on AI for edibility decisions

If the image does not contain a mushroom, set scientific_name to ""
and explain briefly in the disclaimer field.
The mushroom is assumed to have been found in Japan, so only consider
species native to or commonly found in Japan. If GPS coordinates were
provided, factor in which species are likely to occur in that region of Japan.
When describing key features, use simple language that a beginner could understand and look for (e.g. "red cap with white spots", "gills that are free from the stem", "grows on wood"). 
For similar species, choose ones that are visually similar and could be confused with the identified species, and briefly explain how to tell them apart in the key_features field.
Always include a clear safety disclaimer, even for edible mushrooms, emphasizing that visual identification can be unreliable and that one should consult multiple sources or an expert before consuming any wild mushroom.
Requirements:
- Always respond in Japanese
- Use clear, natural Japanese
- Include:
  - 推定される種名（日本語名と学名）
  - 特徴の説明
  - 類似種との違い
  - 食用可否（不明な場合は「不明」とする）
"""


def _media_type(path: str) -> str:
    ext = Path(path).suffix.lower()
    mt  = MEDIA_TYPES.get(ext)
    if mt is None:
        raise ValueError(
            f"Unsupported image format: {ext}. "
            f"Supported: {', '.join(MEDIA_TYPES)}"
        )
    return mt


MAX_SIZE = (1024, 1024)

def _encode_file(path: str) -> str:
    with Image.open(path) as img:
        # Convert to RGB to avoid issues with PNG (RGBA, etc.)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        # Resize in-place while preserving aspect ratio
        img.thumbnail(MAX_SIZE)

        # Save to buffer (JPEG is usually smaller than PNG)
        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=85, optimize=True)

        return base64.standard_b64encode(buffer.getvalue()).decode("utf-8")

# ── Main identification function ─────────────────────────────

def identify_mushroom(
    image_paths: List[str],
    lat: float | None = None,
    lon: float | None = None,
    model: str = "claude-sonnet-4-6",
) -> dict:
    """
    Identify a mushroom from a local image file using Claude Vision.

    Args:
        image_paths: List of paths to the image files (JPEG, PNG, GIF, WebP).
        lat:        Optional latitude — improves accuracy by narrowing
                    candidate species to those found in that region.
        lon:        Optional longitude.
        model:      Claude model to use. claude-sonnet-4-6 is the
                    recommended balance of accuracy and cost.

    Returns:
        Parsed dict with keys: scientific_name, japanese_name,
        confidence, shape, edibility, key_features,
        similar_species, disclaimer.

    Raises:
        ValueError: Unsupported image format.
        anthropic.APIError: API request failed.
        json.JSONDecodeError: Model returned non-JSON (should not happen
                              with this prompt but handle defensively).
    """
    from .config import ANTHROPIC_API_KEY
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

    # Build the location context if coordinates are provided
    if lat is not None and lon is not None:
        location_hint = (
            f"This photo was taken in Japan at "
            f"latitude {lat:.4f}, longitude {lon:.4f}. "
            "Please factor in which species are likely to occur in that region."
        )
    else:
        location_hint = (
            "No GPS coordinates were provided. "
            "Assume the mushroom was found somewhere in Japan."
        )

    if len(image_paths) > 1:
        content = []
        # Add multiple images
        for path in image_paths:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": _media_type(path),
                    "data": _encode_file(path),
                },
            })

        # Add text prompt
        content.append({
            "type": "text",
            "text": location_hint + "\n複数の画像を総合的に見て同定してください。"
        })
        response = client.messages.create(
            model=model,
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": content
                }
            ],
        )
    else:
        image_path = image_paths[0]
        response = client.messages.create(
            model=model,
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type":       "base64",
                                "media_type": _media_type(image_path),
                                "data":       _encode_file(image_path),
                            },
                        },
                        {
                            "type": "text",
                            "text": location_hint,
                        },
                    ],
                }
            ],
        )

    raw = response.content[0].text.strip()

    # Strip accidental markdown fences if the model adds them
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]          # remove opening fence line
        raw = raw.rsplit("```", 1)[0].strip() # remove closing fence

    return json.loads(raw)


def identify_mushroom_from_url(
    image_urls: str,
    lat: float | None = None,
    lon: float | None = None,
    model: str = "claude-sonnet-4-6",
) -> dict:
    """
    Same as identify_mushroom() but takes a publicly accessible URL
    instead of a local file path. Useful when images are already hosted
    (e.g. user-uploaded to S3, or iNaturalist observation photos).
    """
    client = anthropic.Anthropic()

    location_hint = (
        f"Taken in Japan at lat {lat:.4f}, lon {lon:.4f}."
        if lat is not None and lon is not None
        else "No GPS provided. Assume somewhere in Japan."
    )

    response = client.messages.create(
        model=model,
        max_tokens=1024,
        system=_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "url",
                            "url":  image_url,
                        },
                    },
                    {
                        "type": "text",
                        "text": location_hint,
                    },
                ],
            }
        ],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        raw = raw.rsplit("```", 1)[0].strip()

    return json.loads(raw)