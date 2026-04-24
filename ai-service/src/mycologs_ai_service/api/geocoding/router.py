import asyncio
from fastapi import APIRouter, Request

from mycologs_ai_service.api.geocoding.schemas import GeocodingRequest, GeocodingResult
from mycologs_ai_service.api.geocoding import agent
from mycologs_ai_service.core.exceptions import client_disconnected, internal_error

router = APIRouter(prefix="/geocoding", tags=["geocoding"])


@router.post("/evaluate", response_model=GeocodingResult)
async def evaluate_geocoding(payload: GeocodingRequest, request: Request):
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
        raise internal_error(e)
