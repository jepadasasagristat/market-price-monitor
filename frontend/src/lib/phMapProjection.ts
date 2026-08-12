export const PH_MAP_PROJECTION = {
  width: 420,
  height: 620,
  padding: 10,
  lonMin: 116.928864496,
  lonMax: 126.604957428,
  latMin: 4.642097964,
  latMax: 20.935626124,
} as const;

export function latLngToPhMapPoint(lat: number, lng: number) {
  const { width, height, padding, lonMin, lonMax, latMin, latMax } = PH_MAP_PROJECTION;
  const lonSpan = lonMax - lonMin;
  const latSpan = latMax - latMin;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const scale = Math.min(innerW / lonSpan, innerH / latSpan);
  const offsetX = padding + (innerW - lonSpan * scale) / 2;
  const offsetY = padding + (innerH - latSpan * scale) / 2;

  return {
    x: offsetX + (lng - lonMin) * scale,
    y: offsetY + (latMax - lat) * scale,
  };
}
