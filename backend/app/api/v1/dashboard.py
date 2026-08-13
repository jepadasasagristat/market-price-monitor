from fastapi import APIRouter, Query

from app.services.sheet_source import build_commodity_area_prices, build_dashboard, filter_rows, get_latest_rows

router = APIRouter()


@router.get("/dashboard/summary")
def dashboard_summary(
    region: str | None = Query(default=None),
    category: str | None = Query(default=None),
    province: str | None = Query(default=None),
    city: str | None = Query(default=None),
    refresh: bool = Query(default=False),
):
    rows, source = get_latest_rows(force_refresh=refresh)
    national = filter_rows(rows, category=category)
    filtered = filter_rows(
        rows, region=region, category=category, province=province, city=city
    )
    return build_dashboard(filtered, source, national_rows=national)


@router.get("/dashboard/commodity-map")
def commodity_map(
    category: str = Query(...),
    commodity: str = Query(...),
    specifications: str = Query(default=""),
    region: str | None = Query(default=None),
    province: str | None = Query(default=None),
    city: str | None = Query(default=None),
    group_by: str | None = Query(default=None),
    refresh: bool = Query(default=False),
):
    rows, _source = get_latest_rows(force_refresh=refresh)
    return build_commodity_area_prices(
        rows,
        category=category,
        commodity=commodity,
        specifications=specifications,
        region=region,
        province=province,
        city=city,
        group_by=group_by,
    )
