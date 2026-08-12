from __future__ import annotations

import csv
import io
import json
import time
from typing import Any

import httpx

from app.core.config import settings

_cache: dict[str, Any] = {"fetched_at": 0.0, "rows": [], "source": ""}


def _normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    price = row.get("price", "")
    raw_price = str(price).strip() if price is not None else ""
    if raw_price == "" or raw_price.upper() in {"N/A", "NA", "-", "--"}:
        parsed_price = None
    else:
        try:
            parsed_price = float(raw_price.replace(",", ""))
        except ValueError:
            parsed_price = None

    lat = row.get("lat", "")
    lng = row.get("lng", "")
    try:
        lat_n = float(lat) if lat not in ("", None) else None
    except ValueError:
        lat_n = None
    try:
        lng_n = float(lng) if lng not in ("", None) else None
    except ValueError:
        lng_n = None

    price_raw = str(row.get("price_raw") or "")
    if not price_raw and raw_price:
        price_raw = raw_price

    return {
        "scraped_at": str(row.get("scraped_at") or ""),
        "as_of_date": str(row.get("as_of_date") or ""),
        "as_of_date_iso": str(row.get("as_of_date_iso") or ""),
        "region_code": str(row.get("region_code") or ""),
        "region_name": str(row.get("region_name") or ""),
        "province": str(row.get("province") or ""),
        "city_municipality": str(row.get("city_municipality") or ""),
        "category_code": str(row.get("category_code") or ""),
        "category_name": str(row.get("category_name") or ""),
        "commodity": str(row.get("commodity") or ""),
        "specifications": str(row.get("specifications") or ""),
        "market": str(row.get("market") or ""),
        "lat": lat_n,
        "lng": lng_n,
        "price": parsed_price,
        "price_raw": price_raw,
    }


def _load_sample() -> list[dict[str, Any]]:
    path = settings.resolved_sample_path
    if not path.is_file():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    items = payload.get("items", payload if isinstance(payload, list) else [])
    return [_normalize_row(item) for item in items]


def _fetch_webapp() -> list[dict[str, Any]]:
    url = settings.sheets_webapp_url.strip()
    if not url:
        return []
    separator = "&" if "?" in url else "?"
    full_url = f"{url}{separator}action=latest"
    with httpx.Client(timeout=settings.request_timeout_seconds, follow_redirects=True) as client:
        response = client.get(full_url)
        response.raise_for_status()
        payload = response.json()
    if isinstance(payload, dict) and payload.get("error"):
        raise RuntimeError(str(payload["error"]))
    items = payload.get("items", []) if isinstance(payload, dict) else payload
    return [_normalize_row(item) for item in items]


def _fetch_csv_export() -> list[dict[str, Any]]:
    url = settings.latest_csv_url
    if not url:
        return []
    with httpx.Client(timeout=settings.request_timeout_seconds, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()
        text = response.text
    if "<html" in text[:200].lower():
        raise RuntimeError("Google Sheet CSV export returned HTML (sheet may be private).")
    reader = csv.DictReader(io.StringIO(text))
    return [_normalize_row(dict(item)) for item in reader if any(item.values())]


def get_latest_rows(*, force_refresh: bool = False) -> tuple[list[dict[str, Any]], str]:
    now = time.time()
    if (
        not force_refresh
        and _cache["rows"]
        and now - float(_cache["fetched_at"]) < settings.cache_ttl_seconds
    ):
        return list(_cache["rows"]), str(_cache["source"])

    rows: list[dict[str, Any]] = []
    source = "sample"
    errors: list[str] = []

    if settings.sheets_webapp_url.strip():
        try:
            rows = _fetch_webapp()
            source = "sheets_webapp"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"webapp: {exc}")

    if not rows and settings.latest_csv_url:
        try:
            rows = _fetch_csv_export()
            source = "sheets_csv"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"csv: {exc}")

    if not rows:
        rows = _load_sample()
        source = "sample_fallback" if errors else "sample"

    _cache["rows"] = rows
    _cache["source"] = source
    _cache["fetched_at"] = now
    return list(rows), source


def filter_rows(
    rows: list[dict[str, Any]],
    *,
    region: str | None = None,
    category: str | None = None,
    province: str | None = None,
    commodity: str | None = None,
    market: str | None = None,
    q: str | None = None,
    priced_only: bool = False,
) -> list[dict[str, Any]]:
    def norm(value: str | None) -> str:
        return " ".join(str(value or "").upper().split())

    region_n = norm(region)
    category_n = norm(category)
    province_n = norm(province)
    commodity_n = norm(commodity)
    market_n = norm(market)
    q_n = norm(q)

    out: list[dict[str, Any]] = []
    for row in rows:
        if priced_only and row.get("price") is None:
            continue
        if region_n and norm(row.get("region_name")) != region_n and norm(row.get("region_code")) != region_n:
            continue
        if category_n and norm(row.get("category_name")) != category_n and norm(row.get("category_code")) != category_n:
            continue
        if province_n:
            row_province = norm(row.get("province"))
            if province_n not in row_province and row_province not in province_n:
                continue
        if commodity_n and commodity_n not in norm(row.get("commodity")):
            continue
        if market_n and market_n not in norm(row.get("market")):
            continue
        if q_n:
            hay = " ".join(
                [
                    str(row.get("commodity") or ""),
                    str(row.get("specifications") or ""),
                    str(row.get("market") or ""),
                    str(row.get("region_name") or ""),
                    str(row.get("province") or ""),
                    str(row.get("city_municipality") or ""),
                    str(row.get("category_name") or ""),
                ]
            )
            if q_n not in norm(hay):
                continue
        out.append(row)
    return out


def _commodity_price_groups(rows: list[dict[str, Any]]) -> dict[tuple[str, str, str], list[float]]:
    groups: dict[tuple[str, str, str], list[float]] = {}
    for row in rows:
        commodity = str(row.get("commodity") or "").strip()
        price = row.get("price")
        if not commodity or price is None:
            continue
        key = (
            str(row.get("category_name") or "").strip(),
            commodity,
            str(row.get("specifications") or "").strip(),
        )
        groups.setdefault(key, []).append(float(price))
    return groups


def _price_summary(prices: list[float]) -> dict[str, float | int]:
    return {
        "avg": round(sum(prices) / len(prices), 2),
        "min": round(min(prices), 2),
        "max": round(max(prices), 2),
        "n": len(prices),
    }


def build_commodity_area_prices(
    rows: list[dict[str, Any]],
    *,
    category: str,
    commodity: str,
    specifications: str = "",
    region: str | None = None,
    province: str | None = None,
    group_by: str | None = None,
) -> dict[str, Any]:
    def norm(value: str | None) -> str:
        return " ".join(str(value or "").upper().split())

    category_n = norm(category)
    commodity_n = norm(commodity)
    specs_n = norm(specifications)
    region_n = norm(region)
    province_n = norm(province)

    matched: list[dict[str, Any]] = []
    for row in rows:
        if row.get("price") is None:
            continue
        if category_n and norm(row.get("category_name")) != category_n:
            continue
        if commodity_n and norm(row.get("commodity")) != commodity_n:
            continue
        if specs_n != norm(row.get("specifications")):
            continue
        matched.append(row)

    if group_by in {"region", "province", "market"}:
        resolved_group_by = group_by
    elif province_n and region_n:
        resolved_group_by = "market"
    elif region_n:
        resolved_group_by = "province"
    else:
        resolved_group_by = "region"

    if not matched:
        return {
            "category_name": category,
            "commodity": commodity,
            "specifications": specifications,
            "national_avg": None,
            "group_by": resolved_group_by,
            "areas": [],
        }

    national_prices = [float(row["price"]) for row in matched]
    national_avg = round(sum(national_prices) / len(national_prices), 2)

    scoped = matched
    if region_n:
        scoped = [
            row
            for row in matched
            if norm(row.get("region_name")) == region_n or norm(row.get("region_code")) == region_n
        ]
    if province_n:
        scoped = [
            row
            for row in scoped
            if province_n in norm(row.get("province")) or norm(row.get("province")) in province_n
        ]

    groups: dict[str, dict[str, Any]] = {}
    for row in scoped:
        if resolved_group_by == "market":
            market = str(row.get("market") or "").strip()
            city = str(row.get("city_municipality") or "").strip()
            if not market:
                continue
            key = f"{market}|{city}" if city else market
            label = f"{market}, {city}" if city else market
        elif resolved_group_by == "province":
            key = str(row.get("province") or "").strip()
            label = key
        else:
            key = str(row.get("region_name") or row.get("region_code") or "").strip()
            label = key
        if not key:
            continue
        bucket = groups.setdefault(
            key,
            {
                "name": label,
                "market": market if resolved_group_by == "market" else "",
                "city_municipality": city if resolved_group_by == "market" else "",
                "prices": [],
                "lat": None,
                "lng": None,
            },
        )
        bucket["prices"].append(float(row["price"]))
        if resolved_group_by == "market":
            lat = row.get("lat")
            lng = row.get("lng")
            if lat is not None and lng is not None and bucket["lat"] is None:
                bucket["lat"] = float(lat)
                bucket["lng"] = float(lng)

    areas = []
    for key, bucket in sorted(groups.items(), key=lambda item: item[1]["name"].lower()):
        prices = bucket["prices"]
        avg = round(sum(prices) / len(prices), 2)
        delta = avg - national_avg
        tone = "above" if delta > 0.005 else "below"
        area = {
            "id": key,
            "name": bucket["name"],
            "avg_price": avg,
            "min_price": round(min(prices), 2),
            "max_price": round(max(prices), 2),
            "tone": tone,
            "observations": len(prices),
        }
        if resolved_group_by == "market":
            area["market"] = bucket["market"]
            area["city_municipality"] = bucket["city_municipality"]
        if bucket["lat"] is not None and bucket["lng"] is not None:
            area["lat"] = bucket["lat"]
            area["lng"] = bucket["lng"]
        areas.append(area)

    areas.sort(key=lambda item: (item["avg_price"], item["name"].lower()))

    return {
        "category_name": category,
        "commodity": commodity,
        "specifications": specifications,
        "national_avg": national_avg,
        "national_min": round(min(national_prices), 2),
        "national_max": round(max(national_prices), 2),
        "national_observations": len(national_prices),
        "group_by": resolved_group_by,
        "areas": areas,
    }


def build_dashboard(
    rows: list[dict[str, Any]],
    source: str,
    national_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    regions: set[str] = set()
    categories: set[str] = set()
    provinces: set[str] = set()
    markets: set[str] = set()
    commodities: set[str] = set()
    priced = 0
    as_of = ""
    scraped_at = ""
    category_counts: dict[str, int] = {}
    region_counts: dict[str, int] = {}

    for row in rows:
        if row.get("region_name"):
            regions.add(row["region_name"])
            region_counts[row["region_name"]] = region_counts.get(row["region_name"], 0) + 1
        if row.get("category_name"):
            categories.add(row["category_name"])
            category_counts[row["category_name"]] = category_counts.get(row["category_name"], 0) + 1
        if row.get("province"):
            provinces.add(row["province"])
        if row.get("market"):
            markets.add(f"{row.get('region_name')}|{row['market']}")
        if row.get("commodity"):
            commodities.add(row["commodity"])
        if row.get("price") is not None:
            priced += 1
        if not as_of and row.get("as_of_date"):
            as_of = row["as_of_date"]
        if not scraped_at and row.get("scraped_at"):
            scraped_at = row["scraped_at"]

    local_groups = _commodity_price_groups(rows)
    national_groups = _commodity_price_groups(national_rows if national_rows is not None else rows)

    top_commodities = []
    for key, prices in local_groups.items():
        category_name, commodity, specifications = key
        local = _price_summary(prices)
        national = _price_summary(national_groups.get(key, prices))
        top_commodities.append(
            {
                "category_name": category_name,
                "commodity": commodity,
                "specifications": specifications,
                "avg_price": float(local["avg"]),
                "national_avg": float(national["avg"]),
                "min_price": float(national["min"]),
                "max_price": float(national["max"]),
                "observations": int(local["n"]),
            }
        )
    top_commodities.sort(
        key=lambda item: (item["category_name"], item["commodity"], item["specifications"])
    )

    mapped_markets = []
    seen_market = set()
    for row in rows:
        key = f"{row.get('region_name')}|{row.get('market')}"
        if key in seen_market:
            continue
        if row.get("lat") is None or row.get("lng") is None:
            continue
        seen_market.add(key)
        mapped_markets.append(
            {
                "region_name": row.get("region_name"),
                "province": row.get("province"),
                "city_municipality": row.get("city_municipality"),
                "market": row.get("market"),
                "lat": row.get("lat"),
                "lng": row.get("lng"),
            }
        )

    return {
        "meta": {
            "as_of_date": as_of,
            "scraped_at": scraped_at,
            "source": source,
            "row_count": len(rows),
        },
        "counts": {
            "rows": len(rows),
            "priced_rows": priced,
            "regions": len(regions),
            "categories": len(categories),
            "markets": len(markets),
            "commodities": len(commodities),
            "mapped_markets": len(mapped_markets),
        },
        "regions": sorted(regions),
        "categories": sorted(categories),
        "provinces": sorted(provinces),
        "category_counts": [
            {"name": name, "rows": count}
            for name, count in sorted(category_counts.items(), key=lambda x: (-x[1], x[0]))
        ],
        "region_counts": [
            {"name": name, "rows": count}
            for name, count in sorted(region_counts.items(), key=lambda x: (-x[1], x[0]))
        ],
        "top_commodities": top_commodities[:200],
        "mapped_markets": mapped_markets[:500],
    }
