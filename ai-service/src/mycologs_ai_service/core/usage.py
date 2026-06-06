from pydantic import BaseModel, Field


class AiUsage(BaseModel):
    """Token usage for a single Anthropic call, stamped onto each agent's result
    by the service (the model never generates it). The Node gateway reads this to
    record cost. Field names mirror the SDK's `message.usage`."""
    model:                       str
    input_tokens:                int
    output_tokens:               int
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens:     int = 0

    @classmethod
    def from_message(cls, model: str, usage) -> "AiUsage":
        return cls(
            model=model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_creation_input_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
            cache_read_input_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        )
