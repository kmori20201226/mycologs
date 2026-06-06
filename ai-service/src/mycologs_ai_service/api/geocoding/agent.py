import json
from mycologs_ai_service.core.anthropic_client import client
from mycologs_ai_service.core.usage import AiUsage
from mycologs_ai_service.api.geocoding.schemas import GeocodingRequest, GeocodingResult

MODEL = "claude-haiku-4-5-20251001"

SYSTEM_PROMPT = """\
You are a geocoding assistant. Given a place name, return up to 5 candidate locations with their coordinates.
Respond ONLY with a JSON object — no markdown fences, no preamble.
Format: { "candidates": [ { "name": "<full place name>", "longitude": <number>, "latitude": <number> } ] }
If no location can be found, return { "candidates": [] }.
Use decimal degrees. Longitude is east/west (-180 to 180), latitude is north/south (-90 to 90)."""


def evaluate(payload: GeocodingRequest) -> GeocodingResult:
    """
    Blocking call — intended to be run via asyncio.to_thread() in async contexts.
    """
    message = client.messages.create(
        model=MODEL,
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f'Geocode this place: "{payload.place}"'}],
    )

    raw = message.content[0].text.strip()

    if raw.startswith("```"):
        raw = raw.replace(raw.split("\n")[0], "").strip()
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0].strip()

    data = json.loads(raw)
    return GeocodingResult(**data, usage=AiUsage.from_message(MODEL, message.usage))
