from pydantic import BaseModel, Field

from mycologs_ai_service.core.usage import AiUsage


class GeocodingRequest(BaseModel):
    place: str = Field(..., min_length=1)


class GeoCandidate(BaseModel):
    name:      str
    longitude: float
    latitude:  float


class GeocodingResult(BaseModel):
    candidates: list[GeoCandidate]
    usage:      AiUsage | None = None  # stamped by the service, not the model
