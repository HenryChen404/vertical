from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import projects, inbox, coaching, recordings

app = FastAPI(title="PLAUD API")

import os

allow_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api")
app.include_router(inbox.router, prefix="/api")
app.include_router(coaching.router, prefix="/api")
app.include_router(recordings.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
