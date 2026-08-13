import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchCommodityMap, fetchDashboard, fetchFilters } from '@/api/prices';
import { queryKeys } from '@/lib/queryKeys';
import { formatPrice, priceUnit } from '@/lib/format';
import { CATEGORY_EMOJIS } from '@/components/filters/categoryIcons';
import CategoryFilter from '@/components/filters/CategoryFilter';
import CommodityDetailPanel from '@/components/dashboard/CommodityDetailPanel';
import PageHeader from '@/components/ui/PageHeader';
import PhilippinesRegionMap from '@/components/map/PhilippinesRegionMap';

function commodityKey(item: {
  category_name: string;
  commodity: string;
  specifications: string;
}) {
  return `${item.category_name}|${item.commodity}|${item.specifications}`;
}

function vsNational(avg: number, nationalAvg: number) {
  const delta = avg - nationalAvg;
  if (Math.abs(delta) < 0.005) {
    return { tone: 'even' as const, label: 'At national avg' };
  }
  if (delta < 0) {
    return { tone: 'below' as const, label: 'Below national avg' };
  }
  return { tone: 'above' as const, label: 'Above national avg' };
}

type SelectedCommodity = {
  category_name: string;
  commodity: string;
  specifications: string;
};

type RegionalCompareMode = 'province' | 'city' | 'market';

function comparisonScope(
  region: string,
  province: string,
  regionalMode: RegionalCompareMode,
): { label: string; context: string; groupBy: 'region' | 'province' | 'city' | 'market' } {
  if (region === 'NCR' && province) {
    return {
      label: 'Compare by market',
      context: `${province}, NCR`,
      groupBy: 'market',
    };
  }
  if (province && region !== 'NCR') {
    return {
      label: 'Compare by market',
      context: `${province}, ${region}`,
      groupBy: 'market',
    };
  }
  if (region === 'NCR') {
    return regionalMode === 'market'
      ? {
          label: 'Compare by market',
          context: 'NCR',
          groupBy: 'market',
        }
      : {
          label: 'Compare by city',
          context: 'NCR',
          groupBy: 'city',
        };
  }
  if (region) {
    return regionalMode === 'market'
      ? {
          label: 'Compare by market',
          context: region,
          groupBy: 'market',
        }
      : {
          label: 'Compare by province',
          context: region,
          groupBy: 'province',
        };
  }
  return {
    label: 'Compare by region',
    context: 'Nationwide',
    groupBy: 'region',
  };
}

export default function DashboardPage() {
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [category, setCategory] = useState('');
  const [selectedCommodity, setSelectedCommodity] = useState<SelectedCommodity | null>(null);
  const [regionalCompareMode, setRegionalCompareMode] = useState<RegionalCompareMode>('province');
  const [highlightedAreaId, setHighlightedAreaId] = useState<string | null>(null);

  const filters = useQuery({
    queryKey: queryKeys.filters,
    queryFn: () => fetchFilters(),
  });

  const national = useQuery({
    queryKey: queryKeys.dashboard(undefined, category || undefined),
    queryFn: () => fetchDashboard({ category: category || undefined }),
    placeholderData: keepPreviousData,
  });

  const regional = useQuery({
    queryKey: queryKeys.dashboard(region || undefined, category || undefined),
    queryFn: () =>
      fetchDashboard({
        region: region || undefined,
        category: category || undefined,
      }),
    enabled: Boolean(region),
    placeholderData: keepPreviousData,
  });

  const isNcr = region === 'NCR';
  const provinceFilter = isNcr ? undefined : province || undefined;
  const cityFilter = isNcr ? province || undefined : undefined;
  const scope = comparisonScope(region, province, regionalCompareMode);

  const summary = useQuery({
    queryKey: queryKeys.dashboard(
      region || undefined,
      category || undefined,
      provinceFilter,
      cityFilter,
    ),
    queryFn: () =>
      fetchDashboard({
        region: region || undefined,
        category: category || undefined,
        province: provinceFilter,
        city: cityFilter,
      }),
    placeholderData: keepPreviousData,
  });

  const commodityMap = useQuery({
    queryKey: selectedCommodity
      ? queryKeys.commodityMap(
          selectedCommodity.category_name,
          selectedCommodity.commodity,
          selectedCommodity.specifications,
          region || undefined,
          provinceFilter,
          cityFilter,
          scope.groupBy,
        )
      : ['commodity-map', 'idle'],
    queryFn: () =>
      fetchCommodityMap({
        category: selectedCommodity!.category_name,
        commodity: selectedCommodity!.commodity,
        specifications: selectedCommodity!.specifications,
        region: region || undefined,
        province: provinceFilter,
        city: cityFilter,
        group_by: scope.groupBy,
      }),
    enabled: Boolean(selectedCommodity),
    placeholderData: keepPreviousData,
  });

  const needsMarketSuggestion = Boolean(selectedCommodity && scope.groupBy !== 'market');
  const commodityMapMarkets = useQuery({
    queryKey: selectedCommodity
      ? queryKeys.commodityMap(
          selectedCommodity.category_name,
          selectedCommodity.commodity,
          selectedCommodity.specifications,
          region || undefined,
          provinceFilter,
          cityFilter,
          'market',
        )
      : ['commodity-map', 'market-idle'],
    queryFn: () =>
      fetchCommodityMap({
        category: selectedCommodity!.category_name,
        commodity: selectedCommodity!.commodity,
        specifications: selectedCommodity!.specifications,
        region: region || undefined,
        province: provinceFilter,
        city: cityFilter,
        group_by: 'market',
      }),
    enabled: Boolean(selectedCommodity && needsMarketSuggestion),
    placeholderData: keepPreviousData,
  });

  const marketSuggestion =
    scope.groupBy === 'market' ? commodityMap.data : commodityMapMarkets.data;

  const data = summary.data;
  const commodities = data?.top_commodities ?? [];
  const availableRegions = national.data?.regions ?? filters.data?.regions;
  const nationalByKey = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof national.data>['top_commodities'][number]
    >();
    for (const item of national.data?.top_commodities ?? []) {
      map.set(commodityKey(item), item);
    }
    return map;
  }, [national.data]);

  const selectedKey = selectedCommodity ? commodityKey(selectedCommodity) : '';
  const selectedItem = commodities.find((item) => commodityKey(item) === selectedKey);
  const selectedNationwide = selectedItem ? nationalByKey.get(selectedKey) : undefined;
  const regionalItem = regional.data?.top_commodities.find((item) => commodityKey(item) === selectedKey);
  const regionalAvg = region
    ? (regionalItem?.avg_price ?? (!provinceFilter && !cityFilter ? selectedItem?.avg_price : undefined))
    : undefined;
  const provincialAvg = provinceFilter || cityFilter ? selectedItem?.avg_price : undefined;
  const showRegionalCompareTabs = Boolean(region && !province);
  const detailCompareMode = showRegionalCompareTabs
    ? isNcr
      ? regionalCompareMode === 'market'
        ? 'market'
        : 'city'
      : regionalCompareMode === 'market'
        ? 'market'
        : 'province'
    : undefined;
  const isFilterUpdating = Boolean(data) && summary.isFetching;
  const isMapUpdating = Boolean(selectedCommodity) && commodityMap.isFetching;
  const isViewUpdating = isFilterUpdating || isMapUpdating || (Boolean(region) && regional.isFetching);

  return (
    <div className="page">
      <PageHeader title="Overview" />

      <CategoryFilter
        categories={filters.data?.categories ?? data?.categories ?? []}
        value={category}
        onChange={(next) => {
          setCategory(next);
          setSelectedCommodity(null);
          setHighlightedAreaId(null);
        }}
      />

      {summary.isLoading && !data ? (
        <div className="overview-boot-loading" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden />
          <p>Loading overview…</p>
        </div>
      ) : null}
      {summary.isError ? (
        <p className="status-line error">Could not load dashboard. Is the API running?</p>
      ) : null}

      {data ? (
        <div className={`overview-split-wrap${isViewUpdating ? ' is-updating' : ''}`}>
          {isViewUpdating ? (
            <div className="overview-updating-badge" role="status" aria-live="polite">
              <span className="loading-spinner is-sm" aria-hidden />
              Updating filtered view…
            </div>
          ) : null}

          <section className="overview-split" aria-busy={isViewUpdating}>
            <div className="overview-map">
              <PhilippinesRegionMap
                selectedRegion={region}
                selectedProvince={province}
                availableRegions={availableRegions}
                availableProvinces={regional.data?.provinces ?? data?.provinces}
                availableCities={isNcr ? regional.data?.cities ?? data?.cities : undefined}
                areaMarkers={selectedCommodity ? commodityMap.data?.areas : undefined}
                highlightedAreaId={highlightedAreaId}
                selectedCommodityLabel={
                  selectedCommodity
                    ? `${selectedCommodity.commodity}${selectedCommodity.specifications ? ` · ${selectedCommodity.specifications}` : ''}`
                    : undefined
                }
                asOfDate={region ? regional.data?.meta.as_of_date ?? data?.meta.as_of_date : undefined}
                isLoading={isMapUpdating || (isFilterUpdating && Boolean(selectedCommodity))}
                onSelectRegion={(next) => {
                  setRegion(next);
                  setProvince('');
                  setRegionalCompareMode(next === 'NCR' ? 'city' : 'province');
                  setHighlightedAreaId(null);
                }}
                onSelectProvince={(next) => {
                  setProvince(next);
                  setHighlightedAreaId(null);
                }}
              />
            </div>

            <div className="overview-results">
              {isFilterUpdating && !(selectedCommodity && selectedItem) ? (
                <div className="overview-results-overlay" aria-hidden>
                  <span className="loading-spinner" />
                  <span>Refreshing commodities…</span>
                </div>
              ) : null}

              {selectedCommodity && selectedItem ? (
                <CommodityDetailPanel
                  item={{
                    ...selectedItem,
                    national_avg:
                      selectedNationwide?.national_avg ??
                      selectedNationwide?.avg_price ??
                      selectedItem.national_avg,
                    min_price: selectedNationwide?.min_price ?? selectedItem.min_price,
                    max_price: selectedNationwide?.max_price ?? selectedItem.max_price,
                  }}
                  comparison={commodityMap.data}
                  marketSuggestion={marketSuggestion}
                  comparisonLabel={scope.label}
                  scopeContext={scope.context}
                  regionalAvg={regionalAvg}
                  provincialAvg={provincialAvg}
                  localAvgLabel={cityFilter ? 'City Average' : 'Provincial Average'}
                  compareMode={detailCompareMode}
                  compareAreaMode={isNcr ? 'city' : 'province'}
                  onCompareModeChange={
                    showRegionalCompareTabs
                      ? (mode) => {
                          setRegionalCompareMode(
                            mode === 'market' ? 'market' : isNcr ? 'city' : 'province',
                          );
                          setHighlightedAreaId(null);
                        }
                      : undefined
                  }
                  highlightedAreaId={highlightedAreaId}
                  onHoverArea={setHighlightedAreaId}
                  isLoading={isMapUpdating || isFilterUpdating}
                  onClose={() => {
                    setSelectedCommodity(null);
                    setHighlightedAreaId(null);
                  }}
                />
              ) : commodities.length ? (
                <div className="commodity-card-grid">
                  {commodities.map((item, index) => {
                    const key = commodityKey(item);
                    const nationwide = nationalByKey.get(key);
                    const overallAvg =
                      nationwide?.national_avg ??
                      nationwide?.avg_price ??
                      item.national_avg ??
                      item.avg_price;
                    const lowest = nationwide?.min_price ?? item.min_price;
                    const highest = nationwide?.max_price ?? item.max_price;
                    const vs = vsNational(item.avg_price, overallAvg);
                    return (
                      <article
                        key={key}
                        className={`commodity-card${region ? ' has-region' : ''}`}
                        style={{ animationDelay: `${Math.min(index, 16) * 28}ms` }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open ${item.commodity} analysis`}
                        onClick={() => {
                          setSelectedCommodity({
                            category_name: item.category_name,
                            commodity: item.commodity,
                            specifications: item.specifications,
                          });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedCommodity({
                              category_name: item.category_name,
                              commodity: item.commodity,
                              specifications: item.specifications,
                            });
                          }
                        }}
                      >
                        <div className="commodity-card-top">
                          <p className="commodity-card-category">
                            <span className="commodity-card-category-icon" aria-hidden>
                              {CATEGORY_EMOJIS[item.category_name] ?? '📦'}
                            </span>
                            {item.category_name || 'Uncategorized'}
                          </p>
                          <span className="commodity-card-open" aria-hidden>
                            <svg viewBox="0 0 16 16" width="14" height="14">
                              <path
                                d="M6 3.5 10.5 8 6 12.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        </div>
                        <h4 className="commodity-card-name" title={item.commodity}>
                          {item.commodity}
                        </h4>
                        <div className="commodity-card-price-block">
                          <p className="commodity-card-price-label">
                            {region ? 'Local average' : 'Market average'}
                          </p>
                          <p className="commodity-card-price">
                            {formatPrice(item.avg_price)}
                            <span className="commodity-card-price-unit">
                              {priceUnit(item.commodity)}
                            </span>
                          </p>
                          {region ? (
                            <p className={`commodity-card-flag is-${vs.tone}`}>{vs.label}</p>
                          ) : null}
                        </div>
                        <dl className="commodity-card-stats">
                          <div>
                            <dt>National</dt>
                            <dd>{formatPrice(overallAvg)}</dd>
                          </div>
                          <div>
                            <dt>Lowest</dt>
                            <dd>{formatPrice(lowest)}</dd>
                          </div>
                          <div>
                            <dt>Highest</dt>
                            <dd>{formatPrice(highest)}</dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-state">No priced commodities for this filter.</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
