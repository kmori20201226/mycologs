import json
import anthropic as _anthropic
from mycologs_ai_service.core.anthropic_client import client
from mycologs_ai_service.api.identification.schemas import IdentificationRequest, IdentificationResult

MODEL = "claude-opus-4-7"

SYSTEM_PROMPT = """\
You are a mycologist specialising in Japanese fungi.
When given a mushroom photo, respond ONLY with a JSON object —
no markdown fences, no preamble, no explanation outside the JSON.

Required keys:
  scientific_name   string   Best-guess binomial (e.g. "Amanita muscaria")
  japanese_name     string   Standard Japanese name in katakana/kanji, or ""
  confidence        string   One of: "high", "medium", "low"
  score             number   confidence expressed in a number between 0.0 to 1.0.
  shape             string   One of: Cap, Bracket, Coral, Tooth, Jelly, Cup,
                             Puffball, Stinkhorn, Crust, Truffle
  edibility         string   One of: edible, toxic, inedible, unknown
  dialect_names     list     Regional/dialect Japanese names (方言名) if any exist,
                             otherwise an empty list
  key_features      list     2–4 visual features that led to this identification
  similar_species   list     0–2 species that could be confused with this one
  disclaimer        string   Always include a safety disclaimer about not
                             relying on AI for edibility decisions

If the image does not contain a mushroom, set scientific_name to ""
and explain briefly in the disclaimer field.
The mushroom is assumed to have been found in Japan, so only consider
species native to or commonly found in Japan.
When describing key features, use simple language that a beginner could understand.
For similar species, choose ones that are visually similar and briefly explain how to tell them apart.
Always include a clear safety disclaimer, even for edible mushrooms.
Requirements:
- Always respond in Japanese
- Use clear, natural Japanese
- Include:
  - 推定される種名（日本語名と学名）
  - 特徴の説明
  - 類似種との違い
  - 食用可否（不明な場合は「不明」とする）"""


def evaluate(payload: IdentificationRequest) -> IdentificationResult:
    """
    Blocking call — intended to be run via asyncio.to_thread() in async contexts.
    """
    image_blocks: list[_anthropic.ImageBlockParam] = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": img.media_type,
                "data": img.data,
            },
        }
        for img in payload.images
    ]

    has_coords = payload.latitude is not None and payload.longitude is not None
    location_line = (
        f"GPS: latitude {payload.latitude}, longitude {payload.longitude}."
        if has_coords
        else "No GPS provided. Assume somewhere in Japan."
    )
    hint_line = f"\n投稿者からのヒント: {payload.hint}" if payload.hint else ""
    user_text = (
        f"{location_line}{hint_line}\n複数の画像を総合的に見て同定してください。"
        if len(payload.images) > 1
        else f"{location_line}{hint_line}"
    )

    text_block: _anthropic.TextBlockParam = {"type": "text", "text": user_text}

    message = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": [*image_blocks, text_block]}],
    )

    raw = message.content[0].text.strip()

    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:])
    if raw.endswith("```"):
        raw = "\n".join(raw.split("\n")[:-1])

    data = json.loads(raw.strip())
    return IdentificationResult(**data)
