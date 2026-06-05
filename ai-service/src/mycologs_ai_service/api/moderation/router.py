import asyncio
from fastapi import APIRouter, Request

from mycologs_ai_service.api.moderation.schemas import ModerationRequest, ModerationResult
from mycologs_ai_service.api.moderation import agent
from mycologs_ai_service.core.exceptions import (
    client_disconnected,
    insufficient_credit,
    internal_error,
    is_insufficient_credit,
)

router = APIRouter(prefix="/moderation", tags=["moderation"])


@router.post("/evaluate", response_model=ModerationResult)
async def evaluate_post(payload: ModerationRequest, request: Request):
    """
    Evaluate a blog post for moderation.

    The Anthropic call runs in a thread pool so it doesn't block the event
    loop. A disconnect-poller races against it — if the client aborts before
    the AI responds, the task is cancelled and no tokens are wasted.
    """
    ai_task = asyncio.create_task(
        asyncio.to_thread(agent.evaluate, payload.post)
    )

    async def wait_for_disconnect():
        while not await request.is_disconnected():
            await asyncio.sleep(0.5)

    disconnect_task = asyncio.create_task(wait_for_disconnect())

    try:
        done, pending = await asyncio.wait(
            {ai_task, disconnect_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()

        if disconnect_task in done:
            ai_task.cancel()
            raise client_disconnected()

        return ai_task.result()

    except Exception as e:
        if is_insufficient_credit(e):
            raise insufficient_credit()
        if hasattr(e, "status_code"):  # re-raise HTTPExceptions as-is
            raise
        raise internal_error(e)
