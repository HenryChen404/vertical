from dotenv import load_dotenv
load_dotenv()

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
# Suppress noisy request logs
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("google_genai").setLevel(logging.WARNING)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, files, sales, deals, schedule, crm_update, integrations, events, webhooks, recordings, workflows

app = FastAPI(title="PLAUD API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(sales.router, prefix="/api")
app.include_router(deals.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(crm_update.router, prefix="/api")
app.include_router(integrations.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(recordings.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
