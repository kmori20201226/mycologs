import anthropic
from fastapi import HTTPException

# Machine-readable code the API gateway (Node) matches on to recognise that the
# Anthropic *account* credit is exhausted — as opposed to a per-club/user credit
# shortfall, which the gateway handles itself before ever calling this service.
INSUFFICIENT_CREDIT_CODE = "insufficient_ai_credit"


def client_disconnected() -> HTTPException:
    return HTTPException(status_code=499, detail="Client disconnected")


def internal_error(e: Exception) -> HTTPException:
    return HTTPException(status_code=500, detail=str(e))


def is_insufficient_credit(e: Exception) -> bool:
    """True when an Anthropic error signals the account credit balance is exhausted.

    Anthropic returns this as a 400 invalid_request_error whose message contains
    'credit balance is too low'. It is a platform-billing problem, not the
    caller's fault, so we surface it distinctly rather than as a generic 500.
    """
    return (
        isinstance(e, anthropic.APIStatusError)
        and "credit balance is too low" in str(e).lower()
    )


def insufficient_credit() -> HTTPException:
    # 503: the service is temporarily unable to fulfil the request because of an
    # upstream billing issue. The gateway notifies the admin and refunds credit.
    return HTTPException(status_code=503, detail=INSUFFICIENT_CREDIT_CODE)
