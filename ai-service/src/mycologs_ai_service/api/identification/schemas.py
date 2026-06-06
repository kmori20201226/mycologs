from typing import Literal
from pydantic import BaseModel, Field

from mycologs_ai_service.core.usage import AiUsage


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


class SimilarSpecies(BaseModel):
    japanese_name:      str = Field(..., description="類似種の日本語名")
    scientific_name:    str = Field(..., description="類似種の学名")
    how_to_distinguish: str = Field(..., description="本種との見分け方（日本語）")


class IdentificationResult(BaseModel):
    scientific_name: str
    japanese_name:   str
    dialect_names:   list[str]
    confidence:      ConfidenceLevel
    score:           float
    shape:           str
    edibility:       EdibilityLevel
    key_features:    list[str]
    similar_species: list[SimilarSpecies] = Field(default_factory=list)
    missing_info:    list[str] = Field(default_factory=list, description="同定に役立つが不足している情報（例: 胞子紋の色、断面の変色など）")
    disclaimer:      str = Field(default="※ AIによる同定は参考情報です。食用の判断をAIに委ねず、必ず専門家にご確認ください。")
    agent_version:   str = Field(default="", description="同定に使用したエージェントのバージョン")
    usage:           AiUsage | None = None  # stamped by the service, not the model
