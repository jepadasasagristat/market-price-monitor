from fastapi import APIRouter, HTTPException, Query

from app.services.sheet_source import build_market_detail, get_latest_rows, list_markets

router = APIRouter()


@router.get("/markets")
def markets_catalog(
    region: str | None = None,
    province: str | None = None,
    city: str | None = None,
    q: str | None = None,
    refresh: bool = False,
):
    rows, source = get_latest_rows(force_refresh=refresh)
    payload = list_markets(
        rows,
        region=region,
        province=province,
        city=city,
        q=q,
    )
    payload["source"] = source
    payload["meta"] = {
        "total": len(payload["markets"]),
        "source": source,
    }
    return payload


@router.get("/markets/detail")
def market_detail(
    market: str = Query(..., min_length=1),
    region: str | None = None,
    province: str | None = None,
    city: str | None = None,
    refresh: bool = False,
):
    rows, source = get_latest_rows(force_refresh=refresh)
    detail = build_market_detail(
        rows,
        market=market,
        region=region,
        province=province,
        city=city,
    )
    if detail is None:
        raise HTTPException(status_code=404, detail="Market not found")
    detail["source"] = source
    return detail
