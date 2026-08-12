from fastapi import APIRouter, Query

from app.services.sheet_source import filter_rows, get_latest_rows

router = APIRouter()


@router.get("/prices")
def list_prices(
    region: str | None = None,
    category: str | None = None,
    commodity: str | None = None,
    market: str | None = None,
    q: str | None = None,
    priced_only: bool = False,
    limit: int = Query(default=500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    refresh: bool = False,
):
    rows, source = get_latest_rows(force_refresh=refresh)
    filtered = filter_rows(
        rows,
        region=region,
        category=category,
        commodity=commodity,
        market=market,
        q=q,
        priced_only=priced_only,
    )
    total = len(filtered)
    page = filtered[offset : offset + limit]
    as_of = next((row["as_of_date"] for row in filtered if row.get("as_of_date")), "")
    return {
        "meta": {
            "as_of_date": as_of,
            "source": source,
            "total": total,
            "limit": limit,
            "offset": offset,
        },
        "items": page,
    }


@router.get("/prices/filters")
def price_filters(refresh: bool = False):
    rows, source = get_latest_rows(force_refresh=refresh)
    regions = sorted({row["region_name"] for row in rows if row.get("region_name")})
    categories = sorted({row["category_name"] for row in rows if row.get("category_name")})
    commodities = sorted({row["commodity"] for row in rows if row.get("commodity")})
    markets = sorted({row["market"] for row in rows if row.get("market")})
    return {
        "source": source,
        "regions": regions,
        "categories": categories,
        "commodities": commodities,
        "markets": markets,
    }
