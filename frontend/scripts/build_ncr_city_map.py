"""Generate NCR city/municipality SVG paths only (for NCR zoom layer)."""

from __future__ import annotations

import json
import math
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
OUT = DATA / "phNcrCityPaths.ts"

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

NCR_PSGC = 1300000000
WIDTH = 420.0
HEIGHT = 620.0
PADDING = 10.0
EPSILON_CITY = 0.008


def download(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


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
        max_dist = -1.0
        index = -1
        ax, ay = points[start]
        bx, by = points[end]
        for i in range(start + 1, end):
            dist = perp_dist(points[i][0], points[i][1], ax, ay, bx, by)
            if dist > max_dist:
                max_dist = dist
                index = i
        if max_dist > epsilon and index >= 0:
            keep.add(index)
            stack.append((start, index))
            stack.append((index, end))
    return [points[i] for i in sorted(keep)]


def collect_points(features: list[dict]) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []

    def walk(coords):
        if not coords:
            return
        if isinstance(coords[0], (int, float)):
            points.append((float(coords[0]), float(coords[1])))
            return
        for item in coords:
            walk(item)

    for feature in features:
        walk(feature["geometry"]["coordinates"])
    return points


def project_factory(points: list[tuple[float, float]]):
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)
    lon_span = max(max_lon - min_lon, 1e-6)
    lat_span = max(max_lat - min_lat, 1e-6)
    usable_w = WIDTH - PADDING * 2
    usable_h = HEIGHT - PADDING * 2
    scale = min(usable_w / lon_span, usable_h / lat_span)
    offset_x = PADDING + (usable_w - lon_span * scale) / 2
    offset_y = PADDING + (usable_h - lat_span * scale) / 2

    def project(lon: float, lat: float) -> tuple[float, float]:
        x = offset_x + (lon - min_lon) * scale
        y = offset_y + (max_lat - lat) * scale
        return x, y

    return project


def ring_to_path(ring: list[list[float]], project, epsilon: float) -> tuple[str, list[tuple[float, float]]]:
    projected = [list(project(lon, lat)) for lon, lat in ring]
    simplified = simplify(projected, epsilon)
    if len(simplified) < 3:
        return "", []
    parts = [f"M{simplified[0][0]:.1f} {simplified[0][1]:.1f}"]
    for x, y in simplified[1:]:
        parts.append(f"L{x:.1f} {y:.1f}")
    parts.append("Z")
    return "".join(parts), [(p[0], p[1]) for p in simplified]


def feature_to_path(feature: dict, project, epsilon: float):
    geom = feature["geometry"]
    coords = geom["coordinates"]
    parts: list[str] = []
    points: list[tuple[float, float]] = []
    rings = []
    if geom["type"] == "Polygon":
        rings = coords
    elif geom["type"] == "MultiPolygon":
        for poly in coords:
            rings.extend(poly)
    for ring in rings:
        path, pts = ring_to_path(ring, project, epsilon)
        if path:
            parts.append(path)
            points.extend(pts)
    if not points:
        return "", 0.0, 0.0, []
    label_x = sum(p[0] for p in points) / len(points)
    label_y = sum(p[1] for p in points) / len(points)
    return " ".join(parts), label_x, label_y, points


def clean_city_name(raw: str) -> str:
    name = raw.strip()
    name = re.sub(r"^City of\s+", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s*\(Capital\)\s*$", "", name, flags=re.IGNORECASE)
    return name.strip()


def bbox_viewbox(points: list[tuple[float, float]], pad: float = 4.0) -> str:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    width = max(maxx - minx, 8.0)
    height = max(maxy - miny, 8.0)
    extra = 10.0 if width < 40 or height < 40 else pad
    return f"{minx - extra:.1f} {miny - extra:.1f} {width + extra * 2:.1f} {height + extra * 2:.1f}"


def main() -> None:
    print("Downloading country GeoJSON for projection…")
    country = download(COUNTRY_URL)
    project = project_factory(collect_points(country["features"]))

    print("Downloading NCR districts…")
    districts = download(PROVINCE_URL.format(psgc=NCR_PSGC))
    cities: list[dict] = []
    all_pts: list[tuple[float, float]] = []

    for feature in districts["features"]:
        adm2_psgc = int(feature["properties"]["adm2_psgc"])
        district_name = feature["properties"].get("adm2_en", adm2_psgc)
        print(f"Downloading cities for {district_name} ({adm2_psgc})…")
        payload = download(CITY_URL.format(psgc=adm2_psgc))
        for city_feature in payload["features"]:
            raw_name = str(city_feature["properties"].get("adm3_en") or "").strip()
            name = clean_city_name(raw_name)
            d, label_x, label_y, pts = feature_to_path(city_feature, project, EPSILON_CITY)
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
            all_pts.extend(pts)
            print(f"  + {name}")

    # Deduplicate by id (keep first)
    unique: dict[str, dict] = {}
    for city in cities:
        unique.setdefault(city["id"], city)
    cities = sorted(unique.values(), key=lambda row: row["id"])
    view_box = bbox_viewbox(all_pts, pad=6.0) if all_pts else "150.3 208.6 64.4 71.7"

    lines = [
        "export type PhNcrCityPath = {",
        "  id: string;",
        "  label: string;",
        "  d: string;",
        "  labelX: number;",
        "  labelY: number;",
        "};",
        "",
        f"export const NCR_CITY_VIEWBOX = {json.dumps(view_box)};",
        "",
        "export const PH_NCR_CITY_PATHS: PhNcrCityPath[] = [",
    ]
    for item in cities:
        lines.append(
            "  {"
            f' id: {json.dumps(item["id"])},'
            f' label: {json.dumps(item["label"])},'
            f' d: {json.dumps(item["d"])},'
            f' labelX: {item["labelX"]},'
            f' labelY: {item["labelY"]} '
            "},"
        )
    lines.append("];")
    lines.append("")
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT} with {len(cities)} cities ({OUT.stat().st_size} bytes)")
    print(f"ViewBox: {view_box}")


if __name__ == "__main__":
    main()
