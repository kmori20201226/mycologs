import asyncio
import logging
from fastapi import APIRouter, Request

from mycologs_ai_service.api.identification.schemas import IdentificationRequest, IdentificationResult
from mycologs_ai_service.api.identification import agent
from mycologs_ai_service.core.exceptions import client_disconnected, internal_error

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/identification", tags=["identification"])


@router.post("/evaluate", response_model=IdentificationResult)
async def evaluate_identification(payload: IdentificationRequest, request: Request):
    """
    Identify a mushroom from one or more base64-encoded images.

    The Anthropic call runs in a thread pool so it doesn't block the event
    loop. A disconnect-poller races against it — if the client aborts before
    the AI responds, the task is cancelled and no tokens are wasted.
    """
    ai_task = asyncio.create_task(
        asyncio.to_thread(agent.evaluate, payload)
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
        if hasattr(e, "status_code"):
            raise
        logger.exception("Identification failed: %s", e)
        raise internal_error(e)
