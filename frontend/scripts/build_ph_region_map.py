"""Convert NAMRIA/PSGC region, province, and city/municipality GeoJSON into SVG paths."""

from __future__ import annotations

import json
import math
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
COUNTRY_SRC = DATA / "_ph_regions_raw.geojson"
REGION_OUT = DATA / "phRegionPaths.ts"
PROVINCE_OUT = DATA / "phProvincePaths.ts"
CITY_OUT = DATA / "phCityPaths.ts"

COUNTRY_URL = (
    "https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/"
    "2023/geojson/country/lowres/country.0.001.json"
)
PROVINCE_URL = (
    "https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/"
    "2023/geojson/regions/lowres/provdists-region-{psgc}.0.001.json"
)
CITY_URL = (
    "https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/"
    "2023/geojson/provdists/lowres/municities-provdist-{psgc}.0.001.json"
)

REGION_BY_PSGC = {
    100000000: ("Region I", "Ilocos"),
    200000000: ("Region II", "Cagayan Valley"),
    300000000: ("Region III", "Central Luzon"),
    400000000: ("Region IV-A", "CALABARZON"),
    500000000: ("Region V", "Bicol"),
    600000000: ("Region VI", "Western Visayas"),
    700000000: ("Region VII", "Central Visayas"),
    800000000: ("Region VIII", "Eastern Visayas"),
    900000000: ("Region IX", "Zamboanga Peninsula"),
    1000000000: ("Region X", "Northern Mindanao"),
    1100000000: ("Region XI", "Davao"),
    1200000000: ("Region XII", "SOCCSKSARGEN"),
    1300000000: ("NCR", "NCR"),
    1400000000: ("CAR", "Cordillera"),
    1600000000: ("Region XIII", "Caraga"),
    1700000000: ("Region IV-B", "MIMAROPA"),
    1900000000: ("BARMM", "BARMM"),
}

REGION_ORDER = [
    "NCR",
    "CAR",
    "Region I",
    "Region II",
    "Region III",
    "Region IV-A",
    "Region IV-B",
    "Region V",
    "Region VI",
    "Region VII",
    "Region VIII",
    "Region IX",
    "Region X",
    "Region XI",
    "Region XII",
    "Region XIII",
    "BARMM",
]

NCR_LABELS = {
    "NCR, City of Manila, First District (Not a Province)": "Manila",
    "NCR, Second District (Not a Province)": "2nd District",
    "NCR, Third District (Not a Province)": "3rd District",
    "NCR, Fourth District (Not a Province)": "4th District",
}

WIDTH = 420.0
HEIGHT = 620.0
PADDING = 10.0
EPSILON_REGION = 0.035
EPSILON_PROVINCE = 0.018
EPSILON_CITY = 0.01


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=90) as response:
        dest.write_bytes(response.read())


def perp_dist(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(points: list[list[float]], epsilon: float) -> list[list[float]]:
    if len(points) < 3:
        return points
    stack = [(0, len(points) - 1)]
    keep = {0, len(points) - 1}
    while stack:
        start, end = stack.pop()
        ax, ay = points[start]
        bx, by = points[end]
        max_d = -1.0
        max_i = start
        for i in range(start + 1, end):
            d = perp_dist(points[i][0], points[i][1], ax, ay, bx, by)
            if d > max_d:
                max_d = d
                max_i = i
        if max_d > epsilon:
            keep.add(max_i)
            stack.append((start, max_i))
            stack.append((max_i, end))
    simplified = [points[i] for i in sorted(keep)]
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0][:])
    return simplified if len(simplified) >= 4 else points


def iter_rings(geom: dict):
    if geom["type"] == "Polygon":
        yield from geom["coordinates"]
    elif geom["type"] == "MultiPolygon":
        for polygon in geom["coordinates"]:
            yield from polygon


def collect_points(features: list[dict]) -> list[list[float]]:
    pts: list[list[float]] = []
    for feature in features:
        for ring in iter_rings(feature["geometry"]):
            pts.extend(ring)
    return pts


def project_factory(points: list[list[float]]):
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    lon_min, lon_max = min(lons), max(lons)
    lat_min, lat_max = min(lats), max(lats)
    lon_span = max(lon_max - lon_min, 1e-6)
    lat_span = max(lat_max - lat_min, 1e-6)
    inner_w = WIDTH - PADDING * 2
    inner_h = HEIGHT - PADDING * 2
    scale = min(inner_w / lon_span, inner_h / lat_span)
    offset_x = PADDING + (inner_w - lon_span * scale) / 2
    offset_y = PADDING + (inner_h - lat_span * scale) / 2

    def project(lon: float, lat: float) -> tuple[float, float]:
        x = offset_x + (lon - lon_min) * scale
        y = offset_y + (lat_max - lat) * scale
        return round(x, 1), round(y, 1)

    return project


def ring_area_and_centroid(ring_xy: list[tuple[float, float]]) -> tuple[float, float, float]:
    if len(ring_xy) < 3:
        return 0.0, 0.0, 0.0
    area = 0.0
    cx = 0.0
    cy = 0.0
    for i in range(len(ring_xy) - 1):
        x1, y1 = ring_xy[i]
        x2, y2 = ring_xy[i + 1]
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    area *= 0.5
    if abs(area) < 1e-6:
        xs = [p[0] for p in ring_xy]
        ys = [p[1] for p in ring_xy]
        return 0.0, sum(xs) / len(xs), sum(ys) / len(ys)
    return abs(area), cx / (6 * area), cy / (6 * area)


def ring_to_path(ring: list[list[float]], project, epsilon: float) -> tuple[str, float, float, float, list[tuple[float, float]]]:
    simplified = simplify(ring, epsilon)
    if len(simplified) < 4:
        return "", 0.0, 0.0, 0.0, []
    xy = [project(lon, lat) for lon, lat in simplified]
    parts: list[str] = []
    for i, (x, y) in enumerate(xy[:-1]):
        parts.append(f"{'M' if i == 0 else 'L'}{x} {y}")
    parts.append("Z")
    area, cx, cy = ring_area_and_centroid(xy)
    return "".join(parts), area, cx, cy, xy


def feature_to_path(feature: dict, project, epsilon: float) -> tuple[str, float, float, list[tuple[float, float]]]:
    geom = feature.get("geometry")
    if not geom:
        return "", 0.0, 0.0, []
    chunks: list[str] = []
    pts: list[tuple[float, float]] = []
    best_area = -1.0
    label_x = 0.0
    label_y = 0.0
    for ring in iter_rings(geom):
        d, area, cx, cy, xy = ring_to_path(ring, project, epsilon)
        if not d:
            continue
        chunks.append(d)
        pts.extend(xy)
        if area > best_area:
            best_area = area
            label_x, label_y = cx, cy
    return "".join(chunks), label_x, label_y, pts


def bbox_viewbox(points: list[tuple[float, float]], pad: float = 16.0) -> str:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    width = max(maxx - minx, 8.0)
    height = max(maxy - miny, 8.0)
    extra = 28.0 if width < 40 or height < 40 else pad
    return f"{minx - extra:.1f} {miny - extra:.1f} {width + extra * 2:.1f} {height + extra * 2:.1f}"


def clean_province_name(raw: str) -> str:
    if raw in NCR_LABELS:
        return NCR_LABELS[raw]
    name = re.sub(r"\s*\(Not a Province\)", "", raw).strip()
    name = re.sub(r"^City of ", "", name)
    return name


def clean_city_name(raw: str) -> str:
    name = raw.strip()
    name = re.sub(r"^City of\s+", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s*\(Capital\)\s*$", "", name, flags=re.IGNORECASE)
    return name.strip()


def main() -> None:
    if not COUNTRY_SRC.exists():
        print("Downloading country GeoJSON…")
        download(COUNTRY_URL, COUNTRY_SRC)

    country = json.loads(COUNTRY_SRC.read_text(encoding="utf-8"))
    project = project_factory(collect_points(country["features"]))

    regions = []
    for feature in country["features"]:
        psgc = int(feature["properties"]["adm1_psgc"])
        if psgc not in REGION_BY_PSGC:
            raise SystemExit(f"Unmapped PSGC {psgc}: {feature['properties']}")
        region_id, label = REGION_BY_PSGC[psgc]
        d, label_x, label_y, pts = feature_to_path(feature, project, EPSILON_REGION)
        if not d:
            raise SystemExit(f"Empty path for {region_id}")
        regions.append(
            {
                "id": region_id,
                "psgc": psgc,
                "label": label,
                "d": d,
                "labelX": round(label_x, 1),
                "labelY": round(label_y, 1),
                "viewBox": bbox_viewbox(pts),
            }
        )

    by_id = {item["id"]: item for item in regions}
    ordered = [by_id[key] for key in REGION_ORDER]

    region_lines = [
        "export type PhRegionPath = {",
        "  id: string;",
        "  label: string;",
        "  d: string;",
        "  labelX: number;",
        "  labelY: number;",
        "  viewBox: string;",
        "};",
        "",
        f'export const PH_MAP_VIEWBOX = "0 0 {int(WIDTH)} {int(HEIGHT)}";',
        "",
        "export const PH_REGION_PATHS: PhRegionPath[] = [",
    ]
    for item in ordered:
        region_lines.append(
            "  {"
            f' id: {json.dumps(item["id"])},'
            f' label: {json.dumps(item["label"])},'
            f' d: {json.dumps(item["d"])},'
            f' labelX: {item["labelX"]},'
            f' labelY: {item["labelY"]},'
            f' viewBox: {json.dumps(item["viewBox"])} '
            "},"
        )
    region_lines.append("];")
    region_lines.append("")
    REGION_OUT.write_text("\n".join(region_lines), encoding="utf-8")

    provinces_by_region: dict[str, list[dict]] = {}
    cities_by_region: dict[str, dict[str, list[dict]]] = {region_id: {} for region_id in REGION_ORDER}
    province_meta: list[tuple[str, int, str]] = []

    for item in ordered:
        psgc = item["psgc"]
        dest = DATA / f"_ph_prov_{psgc}.json"
        print(f"Downloading provinces for {item['id']}…")
        download(PROVINCE_URL.format(psgc=psgc), dest)
        payload = json.loads(dest.read_text(encoding="utf-8"))
        dest.unlink(missing_ok=True)
        provinces = []
        for feature in payload["features"]:
            raw_name = str(feature["properties"].get("adm2_en") or "").strip()
            name = clean_province_name(raw_name)
            adm2_psgc = int(feature["properties"]["adm2_psgc"])
            d, label_x, label_y, pts = feature_to_path(feature, project, EPSILON_PROVINCE)
            if not d or not name:
                continue
            provinces.append(
                {
                    "id": name,
                    "label": name,
                    "d": d,
                    "labelX": round(label_x, 1),
                    "labelY": round(label_y, 1),
                    "viewBox": bbox_viewbox(pts, pad=12.0),
                }
            )
            province_meta.append((item["id"], adm2_psgc, name))
        provinces.sort(key=lambda row: row["id"])
        provinces_by_region[item["id"]] = provinces

    for region_id, adm2_psgc, province_name in province_meta:
        dest = DATA / f"_ph_city_{adm2_psgc}.json"
        url = CITY_URL.format(psgc=adm2_psgc)
        print(f"Downloading cities for {province_name} ({region_id})…")
        try:
            download(url, dest)
        except Exception as exc:  # noqa: BLE001
            print(f"  skip {province_name}: {exc}")
            cities_by_region[region_id][province_name] = []
            continue
        payload = json.loads(dest.read_text(encoding="utf-8"))
        dest.unlink(missing_ok=True)
        cities = []
        for feature in payload["features"]:
            raw_name = str(feature["properties"].get("adm3_en") or "").strip()
            name = clean_city_name(raw_name)
            d, label_x, label_y, _pts = feature_to_path(feature, project, EPSILON_CITY)
            if not d or not name:
                continue
            cities.append(
                {
                    "id": name,
                    "label": name,
                    "d": d,
                    "labelX": round(label_x, 1),
                    "labelY": round(label_y, 1),
                }
            )
        cities.sort(key=lambda row: row["id"])
        cities_by_region[region_id][province_name] = cities
        print(f"  {province_name}: {len(cities)} cities/municipalities")

    COUNTRY_SRC.unlink(missing_ok=True)
    for leftover in DATA.glob("_ph_*.json"):
        leftover.unlink(missing_ok=True)
    for leftover in DATA.glob("_probe_*.json"):
        leftover.unlink(missing_ok=True)

    prov_lines = [
        "export type PhProvincePath = {",
        "  id: string;",
        "  label: string;",
        "  d: string;",
        "  labelX: number;",
        "  labelY: number;",
        "  viewBox: string;",
        "};",
        "",
        "export const PH_PROVINCES_BY_REGION: Record<string, PhProvincePath[]> = {",
    ]
    for region_id in REGION_ORDER:
        items = provinces_by_region.get(region_id, [])
        prov_lines.append(f"  {json.dumps(region_id)}: [")
        for item in items:
            prov_lines.append(
                "    {"
                f' id: {json.dumps(item["id"])},'
                f' label: {json.dumps(item["label"])},'
                f' d: {json.dumps(item["d"])},'
                f' labelX: {item["labelX"]},'
                f' labelY: {item["labelY"]},'
                f' viewBox: {json.dumps(item["viewBox"])} '
                "},"
            )
        prov_lines.append("  ],")
    prov_lines.append("};")
    prov_lines.append("")
    PROVINCE_OUT.write_text("\n".join(prov_lines), encoding="utf-8")

    city_lines = [
        "export type PhCityPath = {",
        "  id: string;",
        "  label: string;",
        "  d: string;",
        "  labelX: number;",
        "  labelY: number;",
        "};",
        "",
        "export const PH_CITIES_BY_REGION: Record<string, Record<string, PhCityPath[]>> = {",
    ]
    for region_id in REGION_ORDER:
        provinces = cities_by_region.get(region_id, {})
        city_lines.append(f"  {json.dumps(region_id)}: {{")
        for province_name in sorted(provinces.keys(), key=str.lower):
            items = provinces[province_name]
            city_lines.append(f"    {json.dumps(province_name)}: [")
            for item in items:
                city_lines.append(
                    "      {"
                    f' id: {json.dumps(item["id"])},'
                    f' label: {json.dumps(item["label"])},'
                    f' d: {json.dumps(item["d"])},'
                    f' labelX: {item["labelX"]},'
                    f' labelY: {item["labelY"]} '
                    "},"
                )
            city_lines.append("    ],")
        city_lines.append("  },")
    city_lines.append("};")
    city_lines.append("")
    city_lines.append(
        "export function getCitiesForProvince(regionId: string, provinceId: string): PhCityPath[] {"
    )
    city_lines.append(
        "  return PH_CITIES_BY_REGION[regionId]?.[provinceId] ?? [];"
    )
    city_lines.append("}")
    city_lines.append("")
    CITY_OUT.write_text("\n".join(city_lines), encoding="utf-8")

    total_cities = sum(
        len(cities)
        for provinces in cities_by_region.values()
        for cities in provinces.values()
    )
    print(f"Wrote {REGION_OUT} ({REGION_OUT.stat().st_size} bytes)")
    print(f"Wrote {PROVINCE_OUT} ({PROVINCE_OUT.stat().st_size} bytes)")
    print(f"Wrote {CITY_OUT} ({CITY_OUT.stat().st_size} bytes)")
    print(f"Provinces: {sum(len(v) for v in provinces_by_region.values())}")
    print(f"Cities/municipalities: {total_cities}")


if __name__ == "__main__":
    main()
