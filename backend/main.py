from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import files, sales, deals, schedule, crm_update, integrations

app = FastAPI(title="PLAUD API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files.router, prefix="/api")
app.include_router(sales.router, prefix="/api")
app.include_router(deals.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(crm_update.router, prefix="/api")
app.include_router(integrations.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
