from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import settings

app = FastAPI(
    title="Presyong Palengke API",
    version="1.0.0",
    description="Market Price Monitoring API — Latest sheet from Bantay Presyo scrape",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "service": "Presyong Palengke",
        "tagline": "Market Price Monitoring",
        "docs": "/api/docs",
    }
