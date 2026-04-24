from typing import Literal
from pydantic import BaseModel, Field


ConfidenceLevel = Literal["high", "medium", "low"]
EdibilityLevel = Literal["edible", "toxic", "inedible", "unknown"]


class IdentificationImage(BaseModel):
    data:       str = Field(..., description="Base64-encoded JPEG image data")
    media_type: str = Field(default="image/jpeg")


class IdentificationRequest(BaseModel):
    images:    list[IdentificationImage] = Field(..., min_length=1)
    latitude:  float | None = None
    longitude: float | None = None
    hint:      str | None = None


class IdentificationResult(BaseModel):
    scientific_name: str
    japanese_name:   str
    dialect_names:   list[str]
    confidence:      ConfidenceLevel
    shape:           str
    edibility:       EdibilityLevel
    key_features:    list[str | dict]
    similar_species: list[str | dict]
    disclaimer:      str
