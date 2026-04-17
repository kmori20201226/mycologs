from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mycologs_ai_service.api.moderation.router import router as moderation_router

app = FastAPI(title="Blog AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────
# Add new agent routers here as one line each:
#
#   from api.summarizer.router  import router as summarizer_router
#   from api.recommender.router import router as recommender_router
#
app.include_router(moderation_router, prefix="/api")


# ── Health ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}
