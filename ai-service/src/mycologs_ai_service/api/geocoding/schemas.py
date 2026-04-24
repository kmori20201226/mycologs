from pydantic import BaseModel, Field


class GeocodingRequest(BaseModel):
    place: str = Field(..., min_length=1)


class GeoCandidate(BaseModel):
    name:      str
    longitude: float
    latitude:  float


class GeocodingResult(BaseModel):
    candidates: list[GeoCandidate]
