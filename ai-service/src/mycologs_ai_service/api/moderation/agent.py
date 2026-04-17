import json
from mycologs_ai_service.core.anthropic_client import client
from mycologs_ai_service.api.moderation.schemas import ModerationResult, CATEGORY_POINTS

MODEL = "claude-opus-4-5"

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


def evaluate(post: str) -> ModerationResult:
    """
    Blocking call — intended to be run via asyncio.to_thread() in async contexts.
    """
    message = client.messages.create(
        model=MODEL,
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Evaluate this post:\n\n{post}"}],
    )

    raw = message.content[0].text.strip()

    # Strip accidental markdown fences if present
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:])
    if raw.endswith("```"):
        raw = "\n".join(raw.split("\n")[:-1])

    data = json.loads(raw.strip())

    category = data.get("category", "PASS")
    if category not in CATEGORY_POINTS:
        category = "PASS"

    return ModerationResult(
        category=category,
        point=CATEGORY_POINTS[category],
        allowed=category != "OFFENSIVE_SEXUAL",
        confidence=float(data.get("confidence", 1.0)),
        comment=data.get("comment", ""),
    )
