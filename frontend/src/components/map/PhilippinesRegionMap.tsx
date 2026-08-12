import type { CommodityMapArea } from '@/api/prices';
import { PH_MAP_VIEWBOX, PH_REGION_PATHS } from '@/data/phRegionPaths';
import { PH_PROVINCES_BY_REGION } from '@/data/phProvincePaths';
import { useAnimatedViewBox } from '@/hooks/useAnimatedViewBox';
import { latLngToPhMapPoint } from '@/lib/phMapProjection';
import { formatPrice } from '@/lib/format';

type PhilippinesRegionMapProps = {
  selectedRegion: string;
  selectedProvince: string;
  availableRegions?: string[];
  availableProvinces?: string[];
  areaMarkers?: CommodityMapArea[];
  selectedCommodityLabel?: string;
  asOfDate?: string;
  onSelectRegion: (region: string) => void;
  onSelectProvince: (province: string) => void;
};

function regionLabel(id: string) {
  if (id === 'NCR' || id === 'CAR' || id === 'BARMM') return id;
  return id.replace('Region ', 'R');
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function findAreaTone(areas: CommodityMapArea[] | undefined, name: string) {
  if (!areas?.length) return null;
  const target = normalizeName(name);
  const exact = areas.find((area) => normalizeName(area.id) === target);
  if (exact) return exact;
  return (
    areas.find(
      (area) =>
        normalizeName(area.id).includes(target) || target.includes(normalizeName(area.id)),
    ) ?? null
  );
}

function PriceToneIcon({ tone, size }: { tone: 'above' | 'below'; size: number }) {
  const isAbove = tone === 'above';
  const fill = isAbove ? '#c62828' : '#1b7a3d';
  const stroke = '#ffffff';
  return (
    <g>
      <circle r={size} fill={fill} stroke={stroke} strokeWidth={size * 0.14} />
      {isAbove ? (
        <path
          d={`M ${-size * 0.28} ${size * 0.08} L 0 ${-size * 0.34} L ${size * 0.28} ${size * 0.08} Z`}
          fill={stroke}
        />
      ) : (
        <path
          d={`M ${-size * 0.28} ${-size * 0.08} L 0 ${size * 0.34} L ${size * 0.28} ${-size * 0.08} Z`}
          fill={stroke}
        />
      )}
    </g>
  );
}

export default function PhilippinesRegionMap({
  selectedRegion,
  selectedProvince,
  availableRegions,
  availableProvinces,
  areaMarkers,
  selectedCommodityLabel,
  asOfDate,
  onSelectRegion,
  onSelectProvince,
}: PhilippinesRegionMapProps) {
  const zoomed = Boolean(selectedRegion);
  const selected = PH_REGION_PATHS.find((region) => region.id === selectedRegion);
  const targetViewBox = selected?.viewBox ?? PH_MAP_VIEWBOX;
  const viewBox = useAnimatedViewBox(targetViewBox);
  const provinces = selectedRegion ? (PH_PROVINCES_BY_REGION[selectedRegion] ?? []) : [];
  const geoMarkers =
    areaMarkers?.filter(
      (area) => typeof area.lat === 'number' && typeof area.lng === 'number',
    ) ?? [];
  const useGeoMarkers = geoMarkers.length > 0;
  const showingMarkers = Boolean(areaMarkers?.length);
  const markerSize = useGeoMarkers ? (zoomed ? 2.8 : 5.6) : zoomed ? 2.4 : 7.2;

  const availableRegionSet = availableRegions?.length
    ? new Set(availableRegions)
    : new Set(PH_REGION_PATHS.map((region) => region.id));
  const availableProvinceSet = availableProvinces?.length
    ? new Set(availableProvinces.map((name) => name.toLowerCase()))
    : new Set(provinces.map((province) => province.id.toLowerCase()));

  const scopeTitle = selectedProvince || selected?.label || selectedRegion || 'Philippines';
  const scopeHint = selectedCommodityLabel
    ? `Comparing ${selectedCommodityLabel} to the nationwide average.`
    : zoomed
      ? selectedProvince
        ? 'Showing prices for this province. Click again to clear.'
        : 'Click a province to filter prices.'
      : 'Click a region to zoom in by province.';

  return (
    <div className={`ph-map-panel${zoomed ? ' is-zoomed' : ''}${showingMarkers ? ' has-markers' : ''}`}>
      <div className="ph-map-toolbar">
        <div className="ph-map-scope">
          <p className="ph-map-kicker">{zoomed ? 'Region map' : 'National map'}</p>
          <h3 className="ph-map-title">{scopeTitle}</h3>
          {zoomed && asOfDate ? <p className="ph-map-as-of">As of {asOfDate}</p> : null}
          <p className="ph-map-hint">{scopeHint}</p>
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
            Reset Map
          </button>
        ) : null}
      </div>

      {showingMarkers ? (
        <div className="ph-map-legend" aria-label="Price comparison legend">
          <span className="ph-map-legend-item is-above">
            <span className="ph-map-legend-icon" aria-hidden>
              <svg viewBox="0 0 20 20" width="14" height="14">
                <circle cx="10" cy="10" r="9" fill="#c62828" />
                <path d="M6.4 11.2 L10 6.2 L13.6 11.2 Z" fill="#fff" />
              </svg>
            </span>
            Above average
          </span>
          <span className="ph-map-legend-item is-below">
            <span className="ph-map-legend-icon" aria-hidden>
              <svg viewBox="0 0 20 20" width="14" height="14">
                <circle cx="10" cy="10" r="9" fill="#1b7a3d" />
                <path d="M6.4 8.8 L10 13.8 L13.6 8.8 Z" fill="#fff" />
              </svg>
            </span>
            At / below average
          </span>
        </div>
      ) : null}

      <div className={`ph-map${zoomed ? ' is-zoomed' : ''}`}>
        <svg
          className="ph-map-svg"
          viewBox={viewBox}
          role="img"
          aria-label={
            selectedCommodityLabel
              ? `${selectedCommodityLabel} price comparison on the map`
              : zoomed
                ? `${selectedRegion} by province. Click a province to filter prices.`
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

          {provinces.map((province) => {
            const isSelected = province.id === selectedProvince;
            const isAvailable =
              selectedRegion === 'NCR' ||
              !availableProvinces?.length ||
              availableProvinceSet.has(province.id.toLowerCase()) ||
              [...availableProvinceSet].some(
                (name) =>
                  name.includes(province.id.toLowerCase()) ||
                  province.id.toLowerCase().includes(name),
              );
            return (
              <path
                key={province.id}
                d={province.d}
                className={[
                  'ph-map-region ph-map-province',
                  isSelected ? 'is-selected' : '',
                  zoomed && selectedProvince && !isSelected ? 'is-dimmed' : '',
                  !isAvailable ? 'is-empty' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                tabIndex={zoomed ? 0 : -1}
                role="button"
                aria-pressed={isSelected}
                aria-label={province.label}
                onClick={() => {
                  if (!zoomed || !isAvailable) return;
                  onSelectProvince(isSelected ? '' : province.id);
                }}
                onKeyDown={(event) => {
                  if (!zoomed || !isAvailable) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectProvince(isSelected ? '' : province.id);
                  }
                }}
              >
                <title>{province.label}</title>
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
                  {regionLabel(region.id)}
                </text>
              ))
            : provinces.map((province) => (
                <text
                  key={`${province.id}-label`}
                  x={province.labelX}
                  y={province.labelY}
                  className={`ph-map-label${province.id === selectedProvince ? ' is-selected' : ''}`}
                  pointerEvents="none"
                >
                  {province.label}
                </text>
              ))}

          {showingMarkers && !useGeoMarkers && !zoomed
            ? PH_REGION_PATHS.map((region) => {
                const area = findAreaTone(areaMarkers, region.id);
                if (!area) return null;
                const x = region.id === 'NCR' ? region.labelX + 22 : region.labelX;
                const y = region.labelY - 11;
                return (
                  <g
                    key={`${region.id}-marker`}
                    className={`ph-map-marker is-${area.tone}`}
                    transform={`translate(${x} ${y})`}
                    pointerEvents="none"
                  >
                    <title>{`${region.label}: ${formatPrice(area.avg_price)} (${area.tone === 'above' ? 'above' : 'at/below'} average)`}</title>
                    <PriceToneIcon tone={area.tone} size={markerSize} />
                  </g>
                );
              })
            : null}

          {showingMarkers && !useGeoMarkers && zoomed
            ? provinces.map((province) => {
                const area = findAreaTone(areaMarkers, province.id);
                if (!area) return null;
                return (
                  <g
                    key={`${province.id}-marker`}
                    className={`ph-map-marker is-${area.tone}`}
                    transform={`translate(${province.labelX} ${province.labelY - 3.4})`}
                    pointerEvents="none"
                  >
                    <title>{`${province.label}: ${formatPrice(area.avg_price)} (${area.tone === 'above' ? 'above' : 'at/below'} average)`}</title>
                    <PriceToneIcon tone={area.tone} size={markerSize} />
                  </g>
                );
              })
            : null}

          {showingMarkers && useGeoMarkers
            ? geoMarkers.map((area) => {
                const point = latLngToPhMapPoint(area.lat!, area.lng!);
                return (
                  <g
                    key={`${area.id}-geo-marker`}
                    className={`ph-map-marker is-${area.tone}`}
                    transform={`translate(${point.x} ${point.y})`}
                    pointerEvents="none"
                  >
                    <title>{`${area.name}: ${formatPrice(area.avg_price)} (${area.tone === 'above' ? 'above' : 'at/below'} average)`}</title>
                    <PriceToneIcon tone={area.tone} size={markerSize} />
                  </g>
                );
              })
            : null}
        </svg>
      </div>
    </div>
  );
}
