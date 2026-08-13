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
    city: str | None = None,
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
    city_n = norm(city)
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
        if city_n:
            row_city = norm(row.get("city_municipality"))
            if city_n not in row_city and row_city not in city_n:
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
    city: str | None = None,
    group_by: str | None = None,
) -> dict[str, Any]:
    def norm(value: str | None) -> str:
        return " ".join(str(value or "").upper().split())

    category_n = norm(category)
    commodity_n = norm(commodity)
    specs_n = norm(specifications)
    region_n = norm(region)
    province_n = norm(province)
    city_n = norm(city)

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

    if group_by in {"region", "province", "city", "market"}:
        resolved_group_by = group_by
    elif city_n:
        resolved_group_by = "market"
    elif province_n and region_n:
        resolved_group_by = "city"
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
    if city_n:
        scoped = [
            row
            for row in scoped
            if city_n in norm(row.get("city_municipality"))
            or norm(row.get("city_municipality")) in city_n
        ]

    groups: dict[str, dict[str, Any]] = {}
    for row in scoped:
        market = ""
        city_name = ""
        if resolved_group_by == "market":
            market = str(row.get("market") or "").strip()
            city_name = str(row.get("city_municipality") or "").strip()
            if not market:
                continue
            key = f"{market}|{city_name}" if city_name else market
            label = f"{market}, {city_name}" if city_name else market
        elif resolved_group_by == "city":
            key = str(row.get("city_municipality") or "").strip()
            label = key
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
                "city_municipality": city_name
                if resolved_group_by == "market"
                else (key if resolved_group_by == "city" else ""),
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
        if resolved_group_by == "city":
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
    cities: set[str] = set()
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
        if row.get("city_municipality"):
            cities.add(row["city_municipality"])
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
        "cities": sorted(cities),
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


def _norm_text(value: Any) -> str:
    return " ".join(str(value or "").upper().split())


def _market_key(row: dict[str, Any]) -> str:
    return "|".join(
        [
            _norm_text(row.get("region_name")),
            _norm_text(row.get("province")),
            _norm_text(row.get("city_municipality")),
            _norm_text(row.get("market")),
        ]
    )


def list_markets(
    rows: list[dict[str, Any]],
    *,
    region: str | None = None,
    province: str | None = None,
    city: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    region_n = _norm_text(region)
    province_n = _norm_text(province)
    city_n = _norm_text(city)
    q_n = _norm_text(q)

    markets_by_key: dict[str, dict[str, Any]] = {}
    regions: set[str] = set()
    provinces_by_region: dict[str, set[str]] = {}
    cities_by_province: dict[str, set[str]] = {}

    for row in rows:
        market_name = str(row.get("market") or "").strip()
        if not market_name:
            continue
        region_name = str(row.get("region_name") or "").strip()
        province_name = str(row.get("province") or "").strip()
        city_name = str(row.get("city_municipality") or "").strip()

        if region_name:
            regions.add(region_name)
            provinces_by_region.setdefault(region_name, set())
            if province_name:
                provinces_by_region[region_name].add(province_name)
                cities_by_province.setdefault(f"{region_name}|{province_name}", set())
                if city_name:
                    cities_by_province[f"{region_name}|{province_name}"].add(city_name)

        if region_n and _norm_text(region_name) != region_n and _norm_text(row.get("region_code")) != region_n:
            continue
        if province_n:
            row_province = _norm_text(province_name)
            if province_n not in row_province and row_province not in province_n:
                continue
        if city_n:
            row_city = _norm_text(city_name)
            if city_n not in row_city and row_city not in city_n:
                continue
        if q_n:
            market_n = _norm_text(market_name)
            words = market_n.split()
            starts = market_n.startswith(q_n) or any(word.startswith(q_n) for word in words)
            if len(q_n) == 1:
                if not starts:
                    continue
            else:
                hay = _norm_text(" ".join([market_name, city_name, province_name, region_name]))
                if not (starts or q_n in market_n or q_n in hay):
                    continue

        key = _market_key(row)
        existing = markets_by_key.get(key)
        priced = 1 if row.get("price") is not None else 0
        as_of = str(row.get("as_of_date") or "")
        lat = row.get("lat")
        lng = row.get("lng")
        if existing is None:
            markets_by_key[key] = {
                "id": key,
                "market": market_name,
                "region_name": region_name,
                "province": province_name,
                "city_municipality": city_name,
                "lat": lat,
                "lng": lng,
                "as_of_date": as_of,
                "commodity_count": priced,
            }
        else:
            existing["commodity_count"] += priced
            if existing.get("lat") is None and lat is not None:
                existing["lat"] = lat
                existing["lng"] = lng
            if not existing.get("as_of_date") and as_of:
                existing["as_of_date"] = as_of

    markets = list(markets_by_key.values())
    if q_n:
        def _search_rank(item: dict[str, Any]) -> tuple[int, str, str, str, str]:
            name = _norm_text(item["market"])
            words = name.split()
            if name.startswith(q_n):
                rank = 0
            elif any(word.startswith(q_n) for word in words):
                rank = 1
            elif q_n in name:
                rank = 2
            else:
                rank = 3
            return (
                rank,
                item["market"],
                item["region_name"],
                item["province"],
                item["city_municipality"],
            )

        markets = sorted(markets, key=_search_rank)
        if not region_n and not province_n and not city_n:
            markets = markets[:40]
    else:
        markets = sorted(
            markets,
            key=lambda item: (
                item["region_name"],
                item["province"],
                item["city_municipality"],
                item["market"],
            ),
        )

    return {
        "markets": markets,
        "regions": sorted(regions),
        "provinces_by_region": {
            name: sorted(values) for name, values in sorted(provinces_by_region.items())
        },
        "cities_by_province": {
            name: sorted(values) for name, values in sorted(cities_by_province.items())
        },
    }


def build_market_detail(
    rows: list[dict[str, Any]],
    *,
    market: str,
    region: str | None = None,
    province: str | None = None,
    city: str | None = None,
) -> dict[str, Any] | None:
    market_n = _norm_text(market)
    if not market_n:
        return None

    region_n = _norm_text(region)
    province_n = _norm_text(province)
    city_n = _norm_text(city)

    market_rows = []
    for row in rows:
        if _norm_text(row.get("market")) != market_n:
            continue
        if region_n and _norm_text(row.get("region_name")) != region_n and _norm_text(row.get("region_code")) != region_n:
            continue
        if province_n:
            row_province = _norm_text(row.get("province"))
            if province_n not in row_province and row_province not in province_n:
                continue
        if city_n:
            row_city = _norm_text(row.get("city_municipality"))
            if city_n not in row_city and row_city not in city_n:
                continue
        market_rows.append(row)

    if not market_rows:
        return None

    # Prefer an exact unique market location when multiple share the name.
    if not (region_n or province_n or city_n):
        keys = {_market_key(row) for row in market_rows}
        if len(keys) == 1:
            pass
        else:
            # Keep all matching markets' commodities if ambiguous; still use first location.
            pass

    sample = next(
        (row for row in market_rows if row.get("lat") is not None and row.get("lng") is not None),
        market_rows[0],
    )
    region_name = str(sample.get("region_name") or "").strip()
    province_name = str(sample.get("province") or "").strip()
    city_name = str(sample.get("city_municipality") or "").strip()
    market_name = str(sample.get("market") or "").strip()
    as_of = next((str(row.get("as_of_date") or "") for row in market_rows if row.get("as_of_date")), "")

    national_groups = _commodity_price_groups(rows)
    regional_groups = _commodity_price_groups(
        [
            row
            for row in rows
            if _norm_text(row.get("region_name")) == _norm_text(region_name)
            or _norm_text(row.get("region_code")) == _norm_text(region_name)
        ]
    )
    provincial_groups = _commodity_price_groups(
        [
            row
            for row in rows
            if (
                _norm_text(row.get("region_name")) == _norm_text(region_name)
                or _norm_text(row.get("region_code")) == _norm_text(region_name)
            )
            and (
                _norm_text(province_name) in _norm_text(row.get("province"))
                or _norm_text(row.get("province")) in _norm_text(province_name)
            )
        ]
    ) if province_name else {}

    commodities: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for row in market_rows:
        price = row.get("price")
        if price is None:
            continue
        key = (
            str(row.get("category_name") or "").strip(),
            str(row.get("commodity") or "").strip(),
            str(row.get("specifications") or "").strip(),
        )
        if not key[1] or key in seen:
            continue
        seen.add(key)

        national = _price_summary(national_groups.get(key, [float(price)]))
        regional = _price_summary(regional_groups.get(key, [float(price)])) if region_name else None
        provincial = (
            _price_summary(provincial_groups.get(key, [float(price)]))
            if province_name and provincial_groups
            else None
        )
        market_price = float(price)
        national_avg = float(national["avg"])
        regional_avg = float(regional["avg"]) if regional else None
        provincial_avg = float(provincial["avg"]) if provincial else None

        def tone(avg: float | None) -> str | None:
            if avg is None:
                return None
            delta = market_price - avg
            if abs(delta) < 0.005:
                return "even"
            return "above" if delta > 0 else "below"

        commodities.append(
            {
                "category_name": key[0],
                "commodity": key[1],
                "specifications": key[2],
                "price": market_price,
                "national_avg": national_avg,
                "regional_avg": regional_avg,
                "provincial_avg": provincial_avg,
                "vs_national": round(market_price - national_avg, 2),
                "vs_regional": round(market_price - regional_avg, 2) if regional_avg is not None else None,
                "vs_provincial": round(market_price - provincial_avg, 2) if provincial_avg is not None else None,
                "tone_national": tone(national_avg),
                "tone_regional": tone(regional_avg),
                "tone_provincial": tone(provincial_avg),
            }
        )

    commodities.sort(key=lambda item: (item["category_name"], item["commodity"], item["specifications"]))

    return {
        "market": {
            "id": _market_key(sample),
            "market": market_name,
            "region_name": region_name,
            "province": province_name,
            "city_municipality": city_name,
            "lat": sample.get("lat"),
            "lng": sample.get("lng"),
            "as_of_date": as_of,
            "commodity_count": len(commodities),
        },
        "commodities": commodities,
    }
