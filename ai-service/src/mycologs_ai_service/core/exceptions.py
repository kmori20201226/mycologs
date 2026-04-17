from fastapi import HTTPException


def client_disconnected() -> HTTPException:
    return HTTPException(status_code=499, detail="Client disconnected")


def internal_error(e: Exception) -> HTTPException:
    return HTTPException(status_code=500, detail=str(e))
