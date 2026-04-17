from typing import Literal
from pydantic import BaseModel, Field

ModerationCategory = Literal[
    "OFFENSIVE_SEXUAL",
    "POTENTIALLY_OFFENSIVE",
    "OFF_TOPIC_IMAGE",
    "PASS",
]

CATEGORY_POINTS: dict[str, int] = {
    "OFFENSIVE_SEXUAL":      -5,
    "POTENTIALLY_OFFENSIVE": -2,
    "OFF_TOPIC_IMAGE":       -1,
    "PASS":                   0,
}


class ModerationRequest(BaseModel):
    post: str = Field(..., min_length=1, description="Blog post text to evaluate")


class ModerationResult(BaseModel):
    category:   ModerationCategory
    point:      int
    allowed:    bool
    confidence: float = Field(..., ge=0.0, le=1.0)
    comment:    str
