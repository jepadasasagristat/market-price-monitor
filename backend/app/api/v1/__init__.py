from fastapi import APIRouter

from app.api.v1 import dashboard, health, prices

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(dashboard.router, tags=["dashboard"])
api_router.include_router(prices.router, tags=["prices"])
