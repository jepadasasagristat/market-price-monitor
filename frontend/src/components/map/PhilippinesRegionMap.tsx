import type { CommodityMapArea } from '@/api/prices';
import { PH_MAP_VIEWBOX, PH_REGION_PATHS } from '@/data/phRegionPaths';
import { PH_PROVINCES_BY_REGION } from '@/data/phProvincePaths';
import { NCR_CITY_VIEWBOX, PH_NCR_CITY_PATHS } from '@/data/phNcrCityPaths';
import { useAnimatedViewBox } from '@/hooks/useAnimatedViewBox';
import { latLngToPhMapPoint } from '@/lib/phMapProjection';
import { formatPrice } from '@/lib/format';

type PhilippinesRegionMapProps = {
  selectedRegion: string;
  selectedProvince: string;
  availableRegions?: string[];
  availableProvinces?: string[];
  availableCities?: string[];
  areaMarkers?: CommodityMapArea[];
  highlightedAreaId?: string | null;
  selectedCommodityLabel?: string;
  asOfDate?: string;
  isLoading?: boolean;
  onSelectRegion: (region: string) => void;
  onSelectProvince: (province: string) => void;
};

function regionShortLabel(id: string) {
  if (id === 'NCR' || id === 'CAR' || id === 'BARMM') return id;
  return id.replace('Region ', 'R');
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function namesEqual(a: string, b: string) {
  return normalizeName(a) === normalizeName(b);
}

/** Explicit aliases only — never substring match (Region I ⊂ Region III, Davao ⊂ Davao del Sur). */
const FEATURE_ALIASES: Record<string, string[]> = {
  NCR: ['metro manila', 'national capital region'],
  CAR: ['cordillera', 'cordillera administrative region'],
  BARMM: ['bangsamoro', 'armm'],
  'Region IV-A': ['calabarzon', 'region 4-a', 'region iva'],
  'Region IV-B': ['mimaropa', 'region 4-b', 'region ivb'],
  'Region XIII': ['caraga'],
  'Region XII': ['soccsksargen'],
  'Mountain Province': ['mt. province', 'mt province'],
};

function aliasTargets(featureId: string, featureLabel?: string) {
  const keys = [featureId, featureLabel].filter(Boolean) as string[];
  const targets = new Set(keys.map(normalizeName));
  for (const key of keys) {
    for (const alias of FEATURE_ALIASES[key] ?? []) {
      targets.add(normalizeName(alias));
    }
  }
  // Also allow looking up aliases keyed by the feature id itself.
  for (const [canonical, aliases] of Object.entries(FEATURE_ALIASES)) {
    if (namesEqual(canonical, featureId) || (featureLabel && namesEqual(canonical, featureLabel))) {
      aliases.forEach((alias) => targets.add(normalizeName(alias)));
      targets.add(normalizeName(canonical));
    }
  }
  return targets;
}

function findAreaForFeature(
  areas: CommodityMapArea[] | undefined,
  featureId: string,
  featureLabel?: string,
) {
  if (!areas?.length) return null;
  const targets = aliasTargets(featureId, featureLabel);
  return (
    areas.find((area) => targets.has(normalizeName(area.id))) ??
    areas.find((area) => targets.has(normalizeName(area.name))) ??
    null
  );
}

function isHighlightedMarker(
  highlightedAreaId: string | null | undefined,
  area: CommodityMapArea,
  featureId?: string,
  featureLabel?: string,
) {
  if (!highlightedAreaId) return false;
  const highlight = normalizeName(highlightedAreaId);
  if (normalizeName(area.id) === highlight || normalizeName(area.name) === highlight) {
    return true;
  }
  if (featureId && aliasTargets(featureId, featureLabel).has(highlight)) {
    return true;
  }
  return false;
}

function parseViewBoxSize(value: string) {
  const parts = value.split(/[\s,]+/).map(Number);
  return {
    width: parts[2] || 400,
    height: parts[3] || 500,
  };
}

function provinceLabelFontSize(viewBox: string, provinceCount: number) {
  const { width, height } = parseViewBoxSize(viewBox);
  const span = Math.min(width, height);
  const density = Math.max(provinceCount, 1);
  // Scale with zoom extent and pack density so labels stay readable without colliding.
  const sized = span / (density * 2.05 + 18);
  return Math.max(2.35, Math.min(3.35, sized));
}

const PROVINCE_LABEL_ALIASES: Record<string, string> = {
  'Mountain Province': 'Mt. Province',
  'Negros Occidental': 'Negros Occ.',
  'Negros Oriental': 'Negros Or.',
  'Western Samar': 'W. Samar',
  'Northern Samar': 'N. Samar',
  'Eastern Samar': 'E. Samar',
  'Davao del Norte': 'Davao N.',
  'Davao del Sur': 'Davao S.',
  'Davao Occidental': 'Davao Occ.',
  'Davao Oriental': 'Davao Or.',
  'Davao de Oro': 'Davao de Oro',
  'South Cotabato': 'S. Cotabato',
  'North Cotabato': 'N. Cotabato',
  'Sultan Kudarat': 'S. Kudarat',
  'Agusan del Norte': 'Agusan N.',
  'Agusan del Sur': 'Agusan S.',
  'Surigao del Norte': 'Surigao N.',
  'Surigao del Sur': 'Surigao S.',
  'Zamboanga del Norte': 'Zambo. N.',
  'Zamboanga del Sur': 'Zambo. S.',
  'Zamboanga Sibugay': 'Zambo. Sib.',
  'Camarines Norte': 'Cam. Norte',
  'Camarines Sur': 'Cam. Sur',
  'Misamis Occidental': 'Misamis Occ.',
  'Misamis Oriental': 'Misamis Or.',
  'Lanao del Norte': 'Lanao N.',
  'Lanao del Sur': 'Lanao S.',
  'Maguindanao del Norte': 'Mag. Norte',
  'Maguindanao del Sur': 'Mag. Sur',
  'Cotabato City': 'Cotabato City',
  'Nueva Vizcaya': 'N. Vizcaya',
  'Nueva Ecija': 'N. Ecija',
  'Ilocos Norte': 'Ilocos N.',
  'Ilocos Sur': 'Ilocos S.',
};

function provinceDisplayLabel(label: string) {
  return PROVINCE_LABEL_ALIASES[label] ?? label;
}

function provinceLabelLines(label: string) {
  const display = provinceDisplayLabel(label);
  if (display.length <= 11 || !display.includes(' ')) return [display];
  const words = display.split(/\s+/);
  if (words.length === 2) return words;
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

function isNameAvailable(name: string, available: Set<string> | null) {
  if (!available) return true;
  const targets = aliasTargets(name);
  for (const entry of available) {
    if (targets.has(entry) || targets.has(normalizeName(entry))) return true;
  }
  return false;
}

function PriceToneIcon({ tone, size }: { tone: 'above' | 'below'; size: number }) {
  const isAbove = tone === 'above';
  const fill = isAbove ? '#c62828' : '#1b7a3d';
  return (
    <g>
      <circle r={size * 1.22} fill="rgba(255,255,255,0.92)" />
      <circle r={size} fill={fill} stroke="#ffffff" strokeWidth={size * 0.16} />
      {isAbove ? (
        <path
          d={`M ${-size * 0.3} ${size * 0.12} L 0 ${-size * 0.36} L ${size * 0.3} ${size * 0.12} Z`}
          fill="#fff"
        />
      ) : (
        <path
          d={`M ${-size * 0.3} ${-size * 0.12} L 0 ${size * 0.36} L ${size * 0.3} ${-size * 0.12} Z`}
          fill="#fff"
        />
      )}
    </g>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden>
      <path
        d="M4.2 10a5.8 5.8 0 0 1 9.7-4.2M15.8 10a5.8 5.8 0 0 1-9.7 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M14.2 3.8v3.2h-3.2M5.8 16.2v-3.2h3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MapPinMiniIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
      <path
        d="M8 1.6c-2.3 0-4.2 1.8-4.2 4.1 0 3.1 4.2 8.1 4.2 8.1s4.2-5 4.2-8.1C12.2 3.4 10.3 1.6 8 1.6Zm0 5.8A1.7 1.7 0 1 1 8 4a1.7 1.7 0 0 1 0 3.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function PhilippinesRegionMap({
  selectedRegion,
  selectedProvince,
  availableRegions,
  availableProvinces,
  availableCities,
  areaMarkers,
  highlightedAreaId,
  selectedCommodityLabel,
  asOfDate,
  isLoading = false,
  onSelectRegion,
  onSelectProvince,
}: PhilippinesRegionMapProps) {
  const zoomed = Boolean(selectedRegion);
  const isNcr = selectedRegion === 'NCR';
  const selected = PH_REGION_PATHS.find((region) => region.id === selectedRegion);
  const provinces = selectedRegion && !isNcr ? (PH_PROVINCES_BY_REGION[selectedRegion] ?? []) : [];
  const subunits = isNcr ? PH_NCR_CITY_PATHS : provinces;
  const targetViewBox = isNcr ? NCR_CITY_VIEWBOX : selected?.viewBox ?? PH_MAP_VIEWBOX;
  const viewBox = useAnimatedViewBox(targetViewBox);
  const provinceFontSize = provinceLabelFontSize(targetViewBox, Math.max(subunits.length, 1));
  const provinceStroke = Math.max(0.7, provinceFontSize * 0.32);
  const geoMarkers =
    areaMarkers?.filter(
      (area) => typeof area.lat === 'number' && typeof area.lng === 'number',
    ) ?? [];
  const useGeoMarkers = geoMarkers.length > 0;
  const showingMarkers = Boolean(areaMarkers?.length);
  const markerSize = useGeoMarkers ? (zoomed ? (isNcr ? 1.35 : 2.9) : 5.8) : zoomed ? (isNcr ? 1.15 : 2.5) : 7.4;
  const hasTableHighlight = Boolean(highlightedAreaId);
  const subunitNoun = isNcr ? 'city' : 'province';

  const availableRegionSet = availableRegions?.length
    ? new Set(availableRegions)
    : new Set(PH_REGION_PATHS.map((region) => region.id));
  const availableSubunitSet = (() => {
    const source = isNcr ? availableCities : availableProvinces;
    if (!source?.length) return null;
    return new Set(source.map((name) => name.toLowerCase()));
  })();

  const scopeTitle = selectedProvince || selected?.label || selectedRegion || 'Philippines';
  const tipText = selectedCommodityLabel
    ? `Price pins show how ${selectedCommodityLabel} compares with the nationwide average.`
    : zoomed
      ? selectedProvince
        ? `${isNcr ? 'City' : 'Province'} selected. Click it again to clear, or pick another ${subunitNoun}.`
        : isNcr
          ? 'Select a city or municipality to narrow the commodity list.'
          : 'Select a province to narrow the commodity list.'
      : 'Click a region to zoom in and browse provinces.';

  const crumbParts = [
    { label: 'PH', active: !zoomed },
    selectedRegion
      ? { label: regionShortLabel(selectedRegion), active: zoomed && !selectedProvince }
      : null,
    selectedProvince ? { label: selectedProvince, active: true } : null,
  ].filter(Boolean) as { label: string; active: boolean }[];

  const levelChipLabel = !zoomed ? 'National view' : isNcr ? 'City view' : 'Regional view';

  return (
    <div
      className={[
        'ph-map-panel',
        zoomed ? 'is-zoomed' : '',
        showingMarkers ? 'has-markers' : '',
        hasTableHighlight ? 'has-table-highlight' : '',
        isLoading ? 'is-loading' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-busy={isLoading}
    >
      <div className="ph-map-toolbar">
        <div className="ph-map-scope">
          <div className="ph-map-crumbs" aria-label="Map location">
            {crumbParts.map((part, index) => (
              <span key={`${part.label}-${index}`} className="ph-map-crumb-wrap">
                {index > 0 ? <span className="ph-map-crumb-sep" aria-hidden>/</span> : null}
                <span className={`ph-map-crumb${part.active ? ' is-active' : ''}`}>{part.label}</span>
              </span>
            ))}
          </div>
          <h3 className="ph-map-title">{scopeTitle}</h3>
          <div className="ph-map-meta">
            <span className={`ph-map-level-chip${zoomed ? ' is-region' : ' is-national'}`}>
              <MapPinMiniIcon />
              {levelChipLabel}
            </span>
            {zoomed && asOfDate ? <span className="ph-map-as-of">As of {asOfDate}</span> : null}
          </div>
        </div>
        {zoomed ? (
          <button
            type="button"
            className="ph-map-clear"
            onClick={() => {
              onSelectProvince('');
              onSelectRegion('');
            }}
          >
            <ResetIcon />
            Reset
          </button>
        ) : null}
      </div>

      {showingMarkers ? (
        <div className="ph-map-legend" aria-label="Price legend">
          <span className="ph-map-legend-item is-above">
            <span className="ph-map-legend-icon" aria-hidden>
              <svg viewBox="0 0 20 20" width="14" height="14">
                <circle cx="10" cy="10" r="8.2" fill="#c62828" stroke="#fff" strokeWidth="1.5" />
                <path d="M6.2 11.3 L10 6.4 L13.8 11.3 Z" fill="#fff" />
              </svg>
            </span>
            Above
          </span>
          <span className="ph-map-legend-item is-below">
            <span className="ph-map-legend-icon" aria-hidden>
              <svg viewBox="0 0 20 20" width="14" height="14">
                <circle cx="10" cy="10" r="8.2" fill="#1b7a3d" stroke="#fff" strokeWidth="1.5" />
                <path d="M6.2 8.7 L10 13.6 L13.8 8.7 Z" fill="#fff" />
              </svg>
            </span>
            At / below
          </span>
        </div>
      ) : null}

      {isNcr && zoomed ? (
        <div className="ph-map-city-chips" aria-label="NCR cities and municipalities">
          {PH_NCR_CITY_PATHS.map((city) => {
            const isSelected = city.id === selectedProvince;
            const isAvailable = isNameAvailable(city.id, availableSubunitSet);
            return (
              <button
                key={city.id}
                type="button"
                className={[
                  'ph-map-city-chip',
                  isSelected ? 'is-selected' : '',
                  !isAvailable ? 'is-empty' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={!isAvailable}
                aria-pressed={isSelected}
                onClick={() => onSelectProvince(isSelected ? '' : city.id)}
              >
                {city.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className={`ph-map${zoomed ? ' is-zoomed' : ''}${isLoading ? ' is-loading' : ''}${isNcr ? ' is-ncr' : ''}`}>
        {isLoading ? (
          <div className="ph-map-loading" role="status" aria-live="polite">
            <span className="loading-spinner is-sm" aria-hidden />
            <span>Updating map…</span>
          </div>
        ) : null}
        <svg
          className="ph-map-svg"
          viewBox={viewBox}
          role="img"
          aria-label={
            selectedCommodityLabel
              ? `${selectedCommodityLabel} price comparison on the map`
              : zoomed
                ? isNcr
                  ? 'NCR by city. Click a city to filter prices.'
                  : `${selectedRegion} by province. Click a province to filter prices.`
                : 'Philippines by region. Click a region to zoom in.'
          }
        >
          {PH_REGION_PATHS.map((region) => {
            const isSelected = region.id === selectedRegion;
            const isAvailable = availableRegionSet.has(region.id);
            if (zoomed && isSelected) return null;
            return (
              <path
                key={region.id}
                d={region.d}
                className={[
                  'ph-map-region',
                  zoomed ? 'is-dimmed' : '',
                  !isAvailable ? 'is-empty' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                tabIndex={zoomed || !isAvailable ? -1 : 0}
                role="button"
                aria-pressed={isSelected}
                aria-label={`${region.id} — ${region.label}`}
                onClick={() => {
                  if (zoomed || !isAvailable) return;
                  onSelectRegion(region.id);
                }}
                onKeyDown={(event) => {
                  if (zoomed || !isAvailable) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectRegion(region.id);
                  }
                }}
              >
                <title>{`${region.id} — ${region.label}`}</title>
              </path>
            );
          })}

          {subunits.map((subunit) => {
            const isSelected = subunit.id === selectedProvince;
            const isAvailable = isNameAvailable(subunit.id, availableSubunitSet);
            return (
              <path
                key={subunit.id}
                d={subunit.d}
                className={[
                  'ph-map-region',
                  isNcr ? 'ph-map-city' : 'ph-map-province',
                  isSelected ? 'is-selected' : '',
                  zoomed && selectedProvince && !isSelected ? 'is-dimmed' : '',
                  !isAvailable ? 'is-empty' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                tabIndex={zoomed ? 0 : -1}
                role="button"
                aria-pressed={isSelected}
                aria-label={subunit.label}
                onClick={() => {
                  if (!zoomed || !isAvailable) return;
                  onSelectProvince(isSelected ? '' : subunit.id);
                }}
                onKeyDown={(event) => {
                  if (!zoomed || !isAvailable) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectProvince(isSelected ? '' : subunit.id);
                  }
                }}
              >
                <title>{subunit.label}</title>
              </path>
            );
          })}

          {!zoomed
            ? PH_REGION_PATHS.map((region) => (
                <text
                  key={`${region.id}-label`}
                  x={region.id === 'NCR' ? region.labelX + 22 : region.labelX}
                  y={region.labelY}
                  className="ph-map-label"
                  pointerEvents="none"
                >
                  {regionShortLabel(region.id)}
                </text>
              ))
            : isNcr
              ? subunits
                  .filter((city) => city.id === selectedProvince)
                  .map((city) => (
                    <text
                      key={`${city.id}-label`}
                      x={city.labelX}
                      y={city.labelY - 1.6}
                      className="ph-map-label ph-map-province-label is-selected"
                      fontSize={2.2}
                      strokeWidth={0.85}
                      pointerEvents="none"
                    >
                      {city.label}
                    </text>
                  ))
              : subunits.map((province) => {
                  const lines = provinceLabelLines(province.label);
                  const isSelected = province.id === selectedProvince;
                  const fontSize = isSelected ? provinceFontSize * 1.08 : provinceFontSize;
                  const strokeWidth = isSelected ? provinceStroke * 1.15 : provinceStroke;
                  const lineHeight = fontSize * 1.05;
                  const startY = province.labelY - ((lines.length - 1) * lineHeight) / 2;

                  return (
                    <text
                      key={`${province.id}-label`}
                      x={province.labelX}
                      y={startY}
                      className={[
                        'ph-map-label ph-map-province-label',
                        isSelected ? 'is-selected' : '',
                        selectedProvince && !isSelected ? 'is-muted' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      fontSize={fontSize}
                      strokeWidth={strokeWidth}
                      pointerEvents="none"
                    >
                      {lines.map((line, index) => (
                        <tspan
                          key={`${province.id}-line-${index}`}
                          x={province.labelX}
                          dy={index === 0 ? 0 : lineHeight}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  );
                })}

          {showingMarkers && !useGeoMarkers && !zoomed
            ? (() => {
                const markers = PH_REGION_PATHS.flatMap((region) => {
                  const area = findAreaForFeature(areaMarkers, region.id, region.label);
                  if (!area) return [];
                  const x = region.id === 'NCR' ? region.labelX + 22 : region.labelX;
                  const y = region.labelY - 11;
                  const highlighted = isHighlightedMarker(
                    highlightedAreaId,
                    area,
                    region.id,
                    region.label,
                  );
                  return [{ region, area, x, y, highlighted }];
                });
                markers.sort((a, b) => Number(a.highlighted) - Number(b.highlighted));
                return markers.map(({ region, area, x, y, highlighted }) => (
                  <g
                    key={`${region.id}-marker`}
                    className={[
                      'ph-map-marker',
                      `is-${area.tone}`,
                      highlighted ? 'is-highlighted' : '',
                      hasTableHighlight && !highlighted ? 'is-softened' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    transform={`translate(${x} ${y})`}
                    pointerEvents="none"
                  >
                    <title>{`${region.label}: ${formatPrice(area.avg_price)} (${area.tone === 'above' ? 'above' : 'at/below'} average)`}</title>
                    {highlighted ? (
                      <circle className="ph-map-marker-pulse" r={markerSize * 2.15} fill="none" />
                    ) : null}
                    <g className="ph-map-marker-core">
                      <PriceToneIcon tone={area.tone} size={markerSize} />
                    </g>
                  </g>
                ));
              })()
            : null}

          {showingMarkers && !useGeoMarkers && zoomed
            ? (() => {
                const markers = subunits.flatMap((subunit) => {
                  const area = findAreaForFeature(areaMarkers, subunit.id, subunit.label);
                  if (!area) return [];
                  const highlighted = isHighlightedMarker(
                    highlightedAreaId,
                    area,
                    subunit.id,
                    subunit.label,
                  );
                  const markerOffset = isNcr ? 1.1 : 3.6;
                  return [{ subunit, area, highlighted, markerOffset }];
                });
                markers.sort((a, b) => Number(a.highlighted) - Number(b.highlighted));
                return markers.map(({ subunit, area, highlighted, markerOffset }) => (
                  <g
                    key={`${subunit.id}-marker`}
                    className={[
                      'ph-map-marker',
                      `is-${area.tone}`,
                      highlighted ? 'is-highlighted' : '',
                      hasTableHighlight && !highlighted ? 'is-softened' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    transform={`translate(${subunit.labelX} ${subunit.labelY - markerOffset})`}
                    pointerEvents="none"
                  >
                    <title>{`${subunit.label}: ${formatPrice(area.avg_price)} (${area.tone === 'above' ? 'above' : 'at/below'} average)`}</title>
                    {highlighted ? (
                      <circle className="ph-map-marker-pulse" r={markerSize * 2.15} fill="none" />
                    ) : null}
                    <g className="ph-map-marker-core">
                      <PriceToneIcon tone={area.tone} size={markerSize} />
                    </g>
                  </g>
                ));
              })()
            : null}

          {showingMarkers && useGeoMarkers
            ? (() => {
                const markers = geoMarkers.flatMap((area) => {
                  const point = latLngToPhMapPoint(area.lat!, area.lng!);
                  const highlighted = isHighlightedMarker(highlightedAreaId, area);
                  return [{ area, point, highlighted }];
                });
                markers.sort((a, b) => Number(a.highlighted) - Number(b.highlighted));
                return markers.map(({ area, point, highlighted }) => (
                  <g
                    key={`${area.id}-geo-marker`}
                    className={[
                      'ph-map-marker',
                      `is-${area.tone}`,
                      highlighted ? 'is-highlighted' : '',
                      hasTableHighlight && !highlighted ? 'is-softened' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    transform={`translate(${point.x} ${point.y})`}
                    pointerEvents="none"
                  >
                    <title>{`${area.name}: ${formatPrice(area.avg_price)} (${area.tone === 'above' ? 'above' : 'at/below'} average)`}</title>
                    {highlighted ? (
                      <circle className="ph-map-marker-pulse" r={markerSize * 2.4} fill="none" />
                    ) : null}
                    <g className="ph-map-marker-core">
                      <PriceToneIcon tone={area.tone} size={markerSize} />
                    </g>
                  </g>
                ));
              })()
            : null}
        </svg>
      </div>

      <div className="ph-map-tip" aria-label="Map tip">
        <span className="ph-map-tip-caption">Tip</span>
        <span className="ph-map-tip-text">{tipText}</span>
      </div>
    </div>
  );
}
