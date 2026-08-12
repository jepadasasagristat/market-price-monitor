import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchCommodityMap, fetchDashboard, fetchFilters } from '@/api/prices';
import { queryKeys } from '@/lib/queryKeys';
import { formatPrice } from '@/lib/format';
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
    return { tone: 'even' as const, label: 'At nationwide average' };
  }
  if (delta < 0) {
    return { tone: 'below' as const, label: 'Below average market price' };
  }
  return { tone: 'above' as const, label: 'Above average market price' };
}

type SelectedCommodity = {
  category_name: string;
  commodity: string;
  specifications: string;
};

type RegionalCompareMode = 'province' | 'market';

function comparisonScope(
  region: string,
  province: string,
  regionalMode: RegionalCompareMode,
): { label: string; context: string; groupBy: 'region' | 'province' | 'market' } {
  if (province && region !== 'NCR') {
    return {
      label: 'Compare by market',
      context: `${province}, ${region}`,
      groupBy: 'market',
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

  const provinceFilter = region === 'NCR' ? undefined : province || undefined;
  const commodityMapProvince = provinceFilter || undefined;
  const scope = comparisonScope(region, province, regionalCompareMode);

  const summary = useQuery({
    queryKey: queryKeys.dashboard(region || undefined, category || undefined, provinceFilter),
    queryFn: () =>
      fetchDashboard({
        region: region || undefined,
        category: category || undefined,
        province: provinceFilter,
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
          commodityMapProvince,
          scope.groupBy,
        )
      : ['commodity-map', 'idle'],
    queryFn: () =>
      fetchCommodityMap({
        category: selectedCommodity!.category_name,
        commodity: selectedCommodity!.commodity,
        specifications: selectedCommodity!.specifications,
        region: region || undefined,
        province: commodityMapProvince,
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
          commodityMapProvince,
          'market',
        )
      : ['commodity-map', 'market-idle'],
    queryFn: () =>
      fetchCommodityMap({
        category: selectedCommodity!.category_name,
        commodity: selectedCommodity!.commodity,
        specifications: selectedCommodity!.specifications,
        region: region || undefined,
        province: commodityMapProvince,
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
    ? (regionalItem?.avg_price ?? (!provinceFilter ? selectedItem?.avg_price : undefined))
    : undefined;
  const provincialAvg = provinceFilter ? selectedItem?.avg_price : undefined;
  const showRegionalCompareTabs = Boolean(region && !provinceFilter);

  return (
    <div className="page">
      <PageHeader title="Overview" />

      <CategoryFilter
        categories={filters.data?.categories ?? data?.categories ?? []}
        value={category}
        onChange={(next) => {
          setCategory(next);
          setSelectedCommodity(null);
        }}
      />

      {summary.isLoading && !data ? <p className="status-line">Loading overview…</p> : null}
      {summary.isError ? (
        <p className="status-line error">Could not load dashboard. Is the API running?</p>
      ) : null}

      {data ? (
        <section className={`overview-split${summary.isFetching ? ' is-updating' : ''}`}>
          <div className="overview-map">
            <PhilippinesRegionMap
              selectedRegion={region}
              selectedProvince={province}
              availableRegions={availableRegions}
              availableProvinces={regional.data?.provinces ?? data?.provinces}
              areaMarkers={selectedCommodity ? commodityMap.data?.areas : undefined}
              selectedCommodityLabel={
                selectedCommodity
                  ? `${selectedCommodity.commodity}${selectedCommodity.specifications ? ` · ${selectedCommodity.specifications}` : ''}`
                  : undefined
              }
              asOfDate={region ? regional.data?.meta.as_of_date ?? data?.meta.as_of_date : undefined}
              onSelectRegion={(next) => {
                setRegion(next);
                setProvince('');
                setRegionalCompareMode('province');
              }}
              onSelectProvince={setProvince}
            />
          </div>

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
              compareMode={showRegionalCompareTabs ? regionalCompareMode : undefined}
              onCompareModeChange={
                showRegionalCompareTabs ? setRegionalCompareMode : undefined
              }
              isLoading={commodityMap.isFetching}
              onClose={() => setSelectedCommodity(null)}
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
                    className="commodity-card"
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
                    <p className="commodity-card-category">
                      <span aria-hidden>{CATEGORY_EMOJIS[item.category_name] ?? '📦'}</span>
                      {item.category_name || 'Uncategorized'}
                    </p>
                    <h4 className="commodity-card-name" title={item.commodity}>
                      {item.commodity}
                    </h4>
                    <p className="commodity-card-spec">
                      {item.specifications || 'No specification'}
                    </p>
                    <p className="commodity-card-price">{formatPrice(item.avg_price)}</p>
                    <p className={`commodity-card-flag is-${vs.tone}`}>{vs.label}</p>
                    <dl className="commodity-card-stats">
                      <div>
                        <dt>Average</dt>
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
        </section>
      ) : null}
    </div>
  );
}
