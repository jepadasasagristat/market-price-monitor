from fastapi import APIRouter

from app.core.config import settings
from app.services.sheet_source import get_latest_rows

router = APIRouter()


@router.get("/health")
def health():
    rows, source = get_latest_rows()
    return {
        "status": "ok",
        "service": settings.app_name,
        "data_source": source,
        "row_count": len(rows),
    }
