import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  fetchMarketDetail,
  fetchMarketsCatalog,
  type MarketCommodityPrice,
  type MarketSummary,
} from '@/api/prices';
import { queryKeys } from '@/lib/queryKeys';
import { formatPrice, priceUnit } from '@/lib/format';
import CategoryFilter from '@/components/filters/CategoryFilter';
import { CATEGORY_EMOJIS } from '@/components/filters/categoryIcons';
import MarketLocationMap from '@/components/map/MarketLocationMap';
import PageHeader from '@/components/ui/PageHeader';

function formatDelta(delta: number | null | undefined) {
  if (delta == null || !Number.isFinite(delta)) return '—';
  if (Math.abs(delta) < 0.005) return 'Within avg';
  return delta > 0 ? `+${formatPrice(delta)}` : formatPrice(delta);
}

function marketLocationLabel(item: Pick<MarketSummary, 'city_municipality' | 'province' | 'region_name'>) {
  return [item.city_municipality, item.province, item.region_name].filter(Boolean).join(' · ');
}

function normalizeSuggest(text: string) {
  return text.trim().toLowerCase();
}

function suggestionRank(needle: string, market: MarketSummary) {
  const n = normalizeSuggest(needle);
  const name = normalizeSuggest(market.market);
  const words = name.split(/\s+/).filter(Boolean);
  if (name.startsWith(n)) return 0;
  if (words.some((word) => word.startsWith(n))) return 1;
  if (name.includes(n)) return 2;
  if (normalizeSuggest(market.city_municipality).startsWith(n)) return 3;
  const location = normalizeSuggest(
    [market.city_municipality, market.province, market.region_name].join(' '),
  );
  if (location.includes(n)) return 4;
  return 5;
}

function rankMarketSuggestions(
  needle: string,
  markets: MarketSummary[],
  options?: { excludeId?: string; limit?: number },
) {
  const n = normalizeSuggest(needle);
  if (!n) return [];
  const excludeId = options?.excludeId;
  const limit = options?.limit ?? (n.length === 1 ? 12 : 8);
  return markets
    .filter((item) => item.id !== excludeId)
    .map((item) => ({ item, rank: suggestionRank(n, item) }))
    .filter(({ rank }) => (n.length === 1 ? rank <= 1 : rank < 5))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.item.market.localeCompare(b.item.market);
    })
    .slice(0, limit)
    .map(({ item }) => item);
}

function highlightMarketName(name: string, needle: string) {
  const n = needle.trim();
  if (!n) return name;
  const lowerName = name.toLowerCase();
  const lowerNeedle = n.toLowerCase();
  const index = lowerName.indexOf(lowerNeedle);
  if (index < 0) return name;
  return (
    <>
      {name.slice(0, index)}
      <mark className="market-finder-suggest-mark">
        {name.slice(index, index + n.length)}
      </mark>
      {name.slice(index + n.length)}
    </>
  );
}

function commodityKey(item: Pick<MarketCommodityPrice, 'category_name' | 'commodity' | 'specifications'>) {
  return `${item.category_name}|${item.commodity}|${item.specifications}`;
}

function AvgCell({
  avg,
  delta,
  tone,
}: {
  avg: number | null | undefined;
  delta: number | null | undefined;
  tone: 'above' | 'below' | 'even' | null | undefined;
}) {
  if (avg == null) {
    return <span className="market-finder-avg-empty">—</span>;
  }
  return (
    <div className="market-finder-avg-cell">
      <span className="market-finder-avg-value">{formatPrice(avg)}</span>
      <span className={`commodity-detail-vs is-${tone ?? 'even'}`}>
        {formatDelta(delta)}
      </span>
    </div>
  );
}

function MarketPriceCell({
  price,
  unit,
  highlight,
}: {
  price: number | null | undefined;
  unit: string;
  highlight?: 'lower' | 'higher' | null;
}) {
  if (price == null) {
    return <span className="market-finder-avg-empty">—</span>;
  }
  return (
    <div className={`market-finder-price${highlight ? ` is-${highlight}` : ''}`}>
      <span className="market-finder-price-value">{formatPrice(price)}</span>
      <span className="market-finder-unit">{unit}</span>
      {highlight === 'lower' ? (
        <span className="market-finder-price-tag is-lower">Lower</span>
      ) : null}
      {highlight === 'higher' ? (
        <span className="market-finder-price-tag is-higher">Higher</span>
      ) : null}
    </div>
  );
}

function CompareResult({
  leftName,
  rightName,
  leftPrice,
  rightPrice,
}: {
  leftName: string;
  rightName: string;
  leftPrice: number | null;
  rightPrice: number | null;
}) {
  if (leftPrice == null && rightPrice == null) {
    return <span className="market-finder-avg-empty">—</span>;
  }
  if (rightPrice == null) {
    return (
      <div className="market-finder-compare-result is-only">
        <span className="market-finder-compare-badge is-muted">Not in compared market</span>
      </div>
    );
  }
  if (leftPrice == null) {
    return <span className="market-finder-avg-empty">—</span>;
  }
  const diff = leftPrice - rightPrice;
  if (Math.abs(diff) < 0.005) {
    return (
      <div className="market-finder-compare-result is-same">
        <span className="market-finder-compare-badge is-even">Same price</span>
      </div>
    );
  }
  const cheaperName = diff < 0 ? leftName : rightName;
  return (
    <div className="market-finder-compare-result is-diff">
      <span className="market-finder-compare-badge is-lower">
        Cheaper Market Price at {cheaperName} by {formatPrice(Math.abs(diff))}
      </span>
    </div>
  );
}

export default function MarketFinderPage() {
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [category, setCategory] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareMarket, setCompareMarket] = useState<MarketSummary | null>(null);
  const [compareRegion, setCompareRegion] = useState('');
  const [compareProvince, setCompareProvince] = useState('');
  const [compareCity, setCompareCity] = useState('');
  const [comparePickId, setComparePickId] = useState('');
  const [compareQ, setCompareQ] = useState('');
  const [compareSuggestionsOpen, setCompareSuggestionsOpen] = useState(false);
  const searchWrapRef = useRef<HTMLLabelElement>(null);
  const compareSearchRef = useRef<HTMLDivElement>(null);

  const filterTree = useQuery({
    queryKey: queryKeys.marketsCatalog(),
    queryFn: () => fetchMarketsCatalog(),
    placeholderData: keepPreviousData,
  });

  const catalog = useQuery({
    queryKey: queryKeys.marketsCatalog(
      region || undefined,
      province || undefined,
      city || undefined,
    ),
    queryFn: () =>
      fetchMarketsCatalog({
        region: region || undefined,
        province: province || undefined,
        city: city || undefined,
      }),
    enabled: Boolean(region),
    placeholderData: keepPreviousData,
  });

  const searchNeedle = q.trim();
  const suggestionsQuery = useQuery({
    queryKey: queryKeys.marketsCatalog(
      undefined,
      undefined,
      undefined,
      searchNeedle || undefined,
    ),
    queryFn: () =>
      fetchMarketsCatalog({
        q: searchNeedle || undefined,
      }),
    enabled: searchNeedle.length >= 1,
    placeholderData: keepPreviousData,
  });

  const markets = region ? (catalog.data?.markets ?? []) : [];
  const selectedFromFilters = useMemo(
    () => markets.find((item) => item.id === selectedId) ?? null,
    [markets, selectedId],
  );
  const selectedFromSuggestions = useMemo(
    () =>
      (suggestionsQuery.data?.markets ?? []).find((item) => item.id === selectedId) ?? null,
    [suggestionsQuery.data, selectedId],
  );
  const selectedMarket = selectedFromFilters ?? selectedFromSuggestions;

  const detail = useQuery({
    queryKey: selectedMarket
      ? queryKeys.marketDetail(
          selectedMarket.market,
          selectedMarket.region_name,
          selectedMarket.province,
          selectedMarket.city_municipality,
        )
      : ['market-detail', 'idle'],
    queryFn: () =>
      fetchMarketDetail({
        market: selectedMarket!.market,
        region: selectedMarket!.region_name || undefined,
        province: selectedMarket!.province || undefined,
        city: selectedMarket!.city_municipality || undefined,
      }),
    enabled: Boolean(selectedMarket),
    placeholderData: keepPreviousData,
  });

  const compareSearchNeedle = compareQ.trim();
  const compareCatalog = useQuery({
    queryKey: queryKeys.marketsCatalog(
      compareRegion || undefined,
      compareProvince || undefined,
      compareCity || undefined,
    ),
    queryFn: () =>
      fetchMarketsCatalog({
        region: compareRegion || undefined,
        province: compareProvince || undefined,
        city: compareCity || undefined,
      }),
    enabled: Boolean(compareOpen && compareRegion),
    placeholderData: keepPreviousData,
  });

  const compareSuggestionsQuery = useQuery({
    queryKey: queryKeys.marketsCatalog(
      undefined,
      undefined,
      undefined,
      compareSearchNeedle || undefined,
    ),
    queryFn: () =>
      fetchMarketsCatalog({
        q: compareSearchNeedle || undefined,
      }),
    enabled: compareOpen && compareSearchNeedle.length >= 1,
    placeholderData: keepPreviousData,
  });

  const compareDetail = useQuery({
    queryKey: compareMarket
      ? queryKeys.marketDetail(
          compareMarket.market,
          compareMarket.region_name,
          compareMarket.province,
          compareMarket.city_municipality,
        )
      : ['market-detail', 'compare-idle'],
    queryFn: () =>
      fetchMarketDetail({
        market: compareMarket!.market,
        region: compareMarket!.region_name || undefined,
        province: compareMarket!.province || undefined,
        city: compareMarket!.city_municipality || undefined,
      }),
    enabled: Boolean(compareMarket),
    placeholderData: keepPreviousData,
  });

  const provinces = region
    ? (filterTree.data?.provinces_by_region?.[region] ?? [])
    : [];
  const cities =
    region && province
      ? (filterTree.data?.cities_by_province?.[`${region}|${province}`] ?? [])
      : [];

  const suggestions = useMemo(
    () => rankMarketSuggestions(searchNeedle, suggestionsQuery.data?.markets ?? []),
    [searchNeedle, suggestionsQuery.data],
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!searchWrapRef.current?.contains(target)) {
        setSuggestionsOpen(false);
      }
      if (!compareSearchRef.current?.contains(target)) {
        setCompareSuggestionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    if (markets.some((item) => item.id === selectedId)) return;
    if (selectedFromSuggestions) return;
    setSelectedId('');
  }, [markets, selectedId, selectedFromSuggestions]);

  const selectMarket = (item: MarketSummary) => {
    setRegion(item.region_name || '');
    setProvince(item.province || '');
    setCity(item.city_municipality || '');
    setSelectedId(item.id);
    setQ('');
    setSuggestionsOpen(false);
  };

  const marketInfo = detail.data?.market ?? selectedMarket;
  const commodities = detail.data?.commodities ?? [];
  const compareCommodities = compareDetail.data?.commodities ?? [];
  const isComparing = Boolean(compareMarket);

  const compareMarkets = useMemo(
    () =>
      (compareRegion ? (compareCatalog.data?.markets ?? []) : []).filter(
        (item) => item.id !== selectedMarket?.id,
      ),
    [compareCatalog.data, compareRegion, selectedMarket?.id],
  );

  const compareProvinces = compareRegion
    ? (filterTree.data?.provinces_by_region?.[compareRegion] ?? [])
    : [];
  const compareCities =
    compareRegion && compareProvince
      ? (filterTree.data?.cities_by_province?.[`${compareRegion}|${compareProvince}`] ?? [])
      : [];

  const compareNextStep = !compareRegion
    ? 'region'
    : !compareProvince
      ? 'province'
      : !compareCity
        ? 'city'
        : !comparePickId
          ? 'market'
          : null;

  const compareFieldClass = (
    key: 'region' | 'province' | 'city' | 'market',
    filled: boolean,
  ) =>
    [
      'market-finder-field',
      key === 'market' ? 'market-finder-market-select' : '',
      filled ? 'is-filled' : '',
      compareNextStep === key ? 'is-next' : '',
    ]
      .filter(Boolean)
      .join(' ');

  const compareSuggestions = useMemo(
    () =>
      rankMarketSuggestions(compareSearchNeedle, compareSuggestionsQuery.data?.markets ?? [], {
        excludeId: selectedMarket?.id,
      }),
    [compareSearchNeedle, compareSuggestionsQuery.data, selectedMarket?.id],
  );

  const compareRows = useMemo(() => {
    const rightMap = new Map(compareCommodities.map((item) => [commodityKey(item), item]));
    return commodities
      .map((left) => {
        const key = commodityKey(left);
        const right = rightMap.get(key) ?? null;
        return {
          key,
          category_name: left.category_name,
          commodity: left.commodity,
          specifications: left.specifications,
          leftPrice: left.price ?? null,
          rightPrice: right?.price ?? null,
        };
      })
      .sort((a, b) => {
        const categoryCmp = (a.category_name || '').localeCompare(b.category_name || '');
        if (categoryCmp !== 0) return categoryCmp;
        return a.commodity.localeCompare(b.commodity);
      });
  }, [commodities, compareCommodities]);

  const commodityCategories = useMemo(() => {
    const source = isComparing
      ? compareRows.map((item) => item.category_name)
      : commodities.map((item) => item.category_name);
    return Array.from(
      new Set(source.filter((name): name is string => Boolean(name))),
    );
  }, [commodities, compareRows, isComparing]);

  const filteredCommodities = useMemo(
    () =>
      category
        ? commodities.filter((item) => item.category_name === category)
        : commodities,
    [commodities, category],
  );

  const filteredCompareRows = useMemo(
    () =>
      category
        ? compareRows.filter((item) => item.category_name === category)
        : compareRows,
    [compareRows, category],
  );

  useEffect(() => {
    setCategory('');
    setCompareMarket(null);
    setCompareOpen(false);
    setCompareRegion('');
    setCompareProvince('');
    setCompareCity('');
    setComparePickId('');
    setCompareQ('');
    setCompareSuggestionsOpen(false);
  }, [selectedMarket?.id]);

  const resetComparePicker = () => {
    setCompareRegion('');
    setCompareProvince('');
    setCompareCity('');
    setComparePickId('');
    setCompareQ('');
    setCompareSuggestionsOpen(false);
  };

  const clearCompare = () => {
    setCompareMarket(null);
    setCompareOpen(false);
    resetComparePicker();
  };

  const selectCompareMarket = (item: MarketSummary) => {
    setCompareMarket(item);
    setCompareOpen(false);
    resetComparePicker();
  };

  const hasCoordinates =
    typeof marketInfo?.lat === 'number' && typeof marketInfo?.lng === 'number';

  const toneSummary = useMemo(() => {
    let below = 0;
    let even = 0;
    let above = 0;
    for (const item of commodities) {
      if (item.tone_national === 'below') below += 1;
      else if (item.tone_national === 'above') above += 1;
      else even += 1;
    }
    return { below, even, above };
  }, [commodities]);

  const hasAnyFilter = Boolean(region || province || city || selectedId || q);
  const nextStep = !region
    ? 'region'
    : !province
      ? 'province'
      : !city
        ? 'city'
        : !selectedFromFilters
          ? 'market'
          : null;

  const clearFilters = () => {
    setRegion('');
    setProvince('');
    setCity('');
    setSelectedId('');
    setCategory('');
    setQ('');
    setSuggestionsOpen(false);
    clearCompare();
  };

  const pathParts = [
    region || null,
    province || null,
    city || null,
    selectedMarket?.market || null,
  ].filter(Boolean) as string[];

  const fieldClass = (key: 'region' | 'province' | 'city' | 'market', filled: boolean) =>
    [
      'market-finder-field',
      key === 'market' ? 'market-finder-market-select' : '',
      filled ? 'is-filled' : '',
      nextStep === key ? 'is-next' : '',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div className="page">
      <PageHeader title="Market Finder" />

      {!selectedMarket ? (
      <section className="panel market-finder-filters" aria-label="Market filters">
        <div className="market-finder-filters-head">
          <div>
            <h3>Find a market</h3>
            <p>Pick location step by step, or search by market name.</p>
          </div>
          {hasAnyFilter ? (
            <button type="button" className="market-finder-clear" onClick={clearFilters}>
              Clear all
            </button>
          ) : null}
        </div>

        {pathParts.length ? (
          <div className="market-finder-path" aria-label="Current selection">
            {pathParts.map((part, index) => (
              <span key={`${part}-${index}`} className="market-finder-path-item">
                {index > 0 ? (
                  <span className="market-finder-path-sep" aria-hidden>
                    ›
                  </span>
                ) : null}
                <span className={index === pathParts.length - 1 ? 'is-current' : undefined}>
                  {part}
                </span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="market-finder-browse">
          <p className="market-finder-section-label">Browse by location</p>
          <div className="market-finder-cascade">
            <label className={fieldClass('region', Boolean(region))}>
              <span className="market-finder-field-label">
                <span className="market-finder-step" aria-hidden>
                  1
                </span>
                Region
              </span>
              <select
                value={region}
                onChange={(event) => {
                  setRegion(event.target.value);
                  setProvince('');
                  setCity('');
                  setSelectedId('');
                  setQ('');
                }}
              >
                <option value="">Select region</option>
                {(filterTree.data?.regions ?? []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <span className="market-finder-cascade-arrow" aria-hidden>
              →
            </span>

            <label className={fieldClass('province', Boolean(province))}>
              <span className="market-finder-field-label">
                <span className="market-finder-step" aria-hidden>
                  2
                </span>
                Province
              </span>
              <select
                value={province}
                disabled={!region}
                onChange={(event) => {
                  setProvince(event.target.value);
                  setCity('');
                  setSelectedId('');
                  setQ('');
                }}
              >
                <option value="">{region ? 'Select province' : 'Select region first'}</option>
                {provinces.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <span className="market-finder-cascade-arrow" aria-hidden>
              →
            </span>

            <label className={fieldClass('city', Boolean(city))}>
              <span className="market-finder-field-label">
                <span className="market-finder-step" aria-hidden>
                  3
                </span>
                City / Municipality
              </span>
              <select
                value={city}
                disabled={!province}
                onChange={(event) => {
                  setCity(event.target.value);
                  setSelectedId('');
                  setQ('');
                }}
              >
                <option value="">{province ? 'Select city' : 'Select province first'}</option>
                {cities.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <span className="market-finder-cascade-arrow" aria-hidden>
              →
            </span>

            <label className={fieldClass('market', Boolean(selectedFromFilters))}>
              <span className="market-finder-field-label">
                <span className="market-finder-step" aria-hidden>
                  4
                </span>
                Market
              </span>
              <select
                value={selectedFromFilters?.id ?? ''}
                onChange={(event) => setSelectedId(event.target.value)}
                disabled={!region || catalog.isLoading || !markets.length}
              >
                <option value="">
                  {!region
                    ? 'Select region first'
                    : catalog.isLoading
                      ? 'Loading markets…'
                      : markets.length
                        ? `Select market (${markets.length.toLocaleString()})`
                        : 'No markets in this location'}
                </option>
                {markets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.market}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="market-finder-or" role="separator">
          <span>or search by name</span>
        </div>

        <label className="market-finder-search" ref={searchWrapRef}>
          <span className="market-finder-field-label">Search market</span>
          <span className="market-finder-search-control">
            <svg
              className="market-finder-search-icon"
              viewBox="0 0 20 20"
              width="18"
              height="18"
              aria-hidden
            >
              <path
                fill="currentColor"
                d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65a1 1 0 0 1-1.42 1.42l-3.65-3.65A5.5 5.5 0 1 1 8.5 3Zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
              />
            </svg>
            <input
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setSuggestionsOpen(true);
              }}
              onFocus={() => setSuggestionsOpen(true)}
              placeholder="Type a letter or market name…"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={suggestionsOpen && suggestions.length > 0}
            />
            {q ? (
              <button
                type="button"
                className="market-finder-search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setQ('');
                  setSuggestionsOpen(false);
                }}
              >
                ×
              </button>
            ) : null}
          </span>
          {suggestionsOpen && searchNeedle.length >= 1 ? (
            <div className="market-finder-suggestions" role="listbox">
              <p className="market-finder-suggestion-hint">
                {searchNeedle.length === 1
                  ? `Markets starting with “${searchNeedle.toUpperCase()}”`
                  : `Suggestions for “${searchNeedle}”`}
              </p>
              {suggestionsQuery.isFetching && !suggestions.length ? (
                <p className="market-finder-suggestion-status">Searching markets…</p>
              ) : null}
              {suggestions.length ? (
                suggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    className="market-finder-suggestion"
                    onClick={() => selectMarket(item)}
                  >
                    <span className="market-finder-suggestion-name">
                      {highlightMarketName(item.market, searchNeedle)}
                    </span>
                    <span className="market-finder-suggestion-meta">
                      {marketLocationLabel(item)}
                    </span>
                  </button>
                ))
              ) : !suggestionsQuery.isFetching ? (
                <p className="market-finder-suggestion-status">No matching markets.</p>
              ) : null}
            </div>
          ) : null}
        </label>
      </section>
      ) : null}

      {filterTree.isLoading && !filterTree.data ? (
        <div className="overview-boot-loading" role="status">
          <span className="loading-spinner" aria-hidden />
          <p>Loading markets…</p>
        </div>
      ) : null}

      {filterTree.isError ? (
        <p className="status-line error">Could not load markets. Is the API running?</p>
      ) : null}

      {filterTree.data && selectedMarket ? (
        <div className="market-finder-detail">
              <section className="market-finder-detail-card">
                <header className="market-finder-detail-banner">
                  <div className="market-finder-detail-banner-copy">
                    <p className="market-finder-kicker">Local market · palengke</p>
                    <h2>{marketInfo?.market}</h2>
                  </div>
                  <button
                    type="button"
                    className="market-finder-new-market"
                    onClick={clearFilters}
                  >
                    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65a1 1 0 0 1-1.42 1.42l-3.65-3.65A5.5 5.5 0 1 1 8.5 3Zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
                      />
                    </svg>
                    Find another market
                  </button>
                </header>

                <div className="market-finder-detail-body">
                  <div className="market-finder-detail-main">
                    <div className="market-finder-facts">
                      <div>
                        <span>Region</span>
                        <strong>{marketInfo?.region_name || '—'}</strong>
                      </div>
                      <div>
                        <span>Province</span>
                        <strong>{marketInfo?.province || '—'}</strong>
                      </div>
                      <div>
                        <span>City / Municipality</span>
                        <strong>{marketInfo?.city_municipality || '—'}</strong>
                      </div>
                    </div>

                    <div className="market-finder-spotlight" aria-label="Market summary">
                      <div className="market-finder-spotlight-item is-accent">
                        <span className="market-finder-spotlight-label">
                          <span className="market-finder-spotlight-icon" aria-hidden>
                            <svg viewBox="0 0 20 20" width="15" height="15">
                              <path
                                fill="currentColor"
                                d="M7.5 2.75A2.75 2.75 0 0 0 4.75 5.5V6H3.5A1.5 1.5 0 0 0 2 7.5v8A1.5 1.5 0 0 0 3.5 17h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 16.5 6h-1.25v-.5A2.75 2.75 0 0 0 12.5 2.75h-5ZM6.25 5.5c0-.69.56-1.25 1.25-1.25h5c.69 0 1.25.56 1.25 1.25V6h-7.5v-.5ZM3.5 7.5h13v8h-13v-8Zm4.25 2a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z"
                              />
                            </svg>
                          </span>
                          Priced commodities
                        </span>
                        <strong>
                          {(
                            marketInfo?.commodity_count ?? commodities.length
                          ).toLocaleString()}
                        </strong>
                      </div>
                      <div className="market-finder-spotlight-item">
                        <span className="market-finder-spotlight-label">
                          <span className="market-finder-spotlight-icon is-below" aria-hidden>
                            <svg viewBox="0 0 20 20" width="15" height="15">
                              <path
                                fill="currentColor"
                                d="M4.22 5.28a.75.75 0 0 1 1.06 0L9 9l1.47-1.47a.75.75 0 0 1 1.06 0l4.25 4.25V10a.75.75 0 0 1 1.5 0v4.75a.75.75 0 0 1-.75.75H12a.75.75 0 0 1 0-1.5h2.19L11 8.56 9.53 10a.75.75 0 0 1-1.06 0L4.22 6.34a.75.75 0 0 1 0-1.06Z"
                              />
                            </svg>
                          </span>
                          Below national avg
                        </span>
                        <strong className="is-below">{toneSummary.below}</strong>
                      </div>
                      <div className="market-finder-spotlight-item">
                        <span className="market-finder-spotlight-label">
                          <span className="market-finder-spotlight-icon is-even" aria-hidden>
                            <svg viewBox="0 0 20 20" width="15" height="15">
                              <path
                                fill="currentColor"
                                d="M4.2 6.15c.9-.95 2.05-1.45 3.45-1.45 1.15 0 2.05.35 2.85.95.8-.6 1.75-.95 2.9-.95 1.35 0 2.5.5 3.4 1.45a.75.75 0 1 1-1.1 1.02c-.6-.65-1.35-.97-2.3-.97-.9 0-1.6.3-2.2.85l-.45.4-.45-.4c-.6-.55-1.3-.85-2.2-.85-.95 0-1.7.32-2.3.97a.75.75 0 1 1-1.1-1.02Zm0 6.7c.9-.95 2.05-1.45 3.45-1.45 1.15 0 2.05.35 2.85.95.8-.6 1.75-.95 2.9-.95 1.35 0 2.5.5 3.4 1.45a.75.75 0 1 1-1.1 1.02c-.6-.65-1.35-.97-2.3-.97-.9 0-1.6.3-2.2.85l-.45.4-.45-.4c-.6-.55-1.3-.85-2.2-.85-.95 0-1.7.32-2.3.97a.75.75 0 1 1-1.1-1.02Z"
                              />
                            </svg>
                          </span>
                          Within national avg
                        </span>
                        <strong className="is-even">{toneSummary.even}</strong>
                      </div>
                      <div className="market-finder-spotlight-item">
                        <span className="market-finder-spotlight-label">
                          <span className="market-finder-spotlight-icon is-above" aria-hidden>
                            <svg viewBox="0 0 20 20" width="15" height="15">
                              <path
                                fill="currentColor"
                                d="M4.22 14.72a.75.75 0 0 1 0-1.06L9 8.88l1.47 1.47a.75.75 0 0 1 1.06 0l4.25-4.25V8a.75.75 0 0 1 1.5 0V3.25a.75.75 0 0 1-.75-.75H12a.75.75 0 0 1 0 1.5h2.19L11 11.44 9.53 10a.75.75 0 0 1-1.06 0L4.22 13.66a.75.75 0 0 1 0 1.06Z"
                              />
                            </svg>
                          </span>
                          Above national avg
                        </span>
                        <strong className="is-above">{toneSummary.above}</strong>
                      </div>
                    </div>

                    {marketInfo?.as_of_date ? (
                      <p className="market-finder-asof-line">
                        <svg
                          className="market-finder-asof-icon"
                          viewBox="0 0 20 20"
                          width="15"
                          height="15"
                          aria-hidden
                        >
                          <path
                            fill="currentColor"
                            d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm10 7H4v7h12V9ZM4 7h12V6H4v1Z"
                          />
                        </svg>
                        <span>
                          All commodity prices are updated as of{' '}
                          <strong>{marketInfo.as_of_date}</strong>
                        </span>
                      </p>
                    ) : null}
                  </div>

                  <aside className="market-finder-detail-map">
                    {hasCoordinates ? (
                      <MarketLocationMap
                        market={{
                          market: marketInfo!.market,
                          region_name: marketInfo!.region_name,
                          province: marketInfo!.province,
                          city_municipality: marketInfo!.city_municipality,
                          lat: marketInfo!.lat!,
                          lng: marketInfo!.lng!,
                        }}
                      />
                    ) : (
                      <div className="market-finder-map-fallback">
                        <p>No map pin available</p>
                        <p>
                          {marketLocationLabel(marketInfo!) || 'Location unavailable'}
                        </p>
                      </div>
                    )}
                  </aside>
                </div>
              </section>

              <section className="market-finder-detail-card market-finder-commodities">
                <div className="market-finder-commodities-head">
                  <div>
                    <h3>Commodity prices</h3>
                    <p>
                      {isComparing
                        ? `Comparing ${marketInfo?.market} with ${compareMarket?.market}.`
                        : 'Market price versus national, regional, and provincial averages.'}
                    </p>
                  </div>
                  <div className="market-finder-commodities-actions">
                    {isComparing ? (
                      <button
                        type="button"
                        className="market-finder-compare-exit"
                        onClick={clearCompare}
                      >
                        Exit compare
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="market-finder-compare-start"
                        onClick={() => {
                          resetComparePicker();
                          setCompareOpen((open) => !open);
                          setCompareSuggestionsOpen(false);
                        }}
                      >
                        <svg
                          className="market-finder-compare-start-icon"
                          viewBox="0 0 20 20"
                          width="16"
                          height="16"
                          aria-hidden
                        >
                          <path
                            d="M6.5 4.5 3.5 7.5 6.5 10.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M3.5 7.5h7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                          />
                          <path
                            d="M13.5 15.5 16.5 12.5 13.5 9.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M16.5 12.5h-7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                          />
                        </svg>
                        Compare Other Market
                      </button>
                    )}
                  </div>
                </div>

                {compareOpen && !isComparing ? (
                  <div className="market-finder-compare-picker" ref={compareSearchRef}>
                    <div className="market-finder-compare-picker-head">
                      <div className="market-finder-compare-picker-copy">
                        <strong>Select another market</strong>
                        <p>Pick location step by step, or search by market name.</p>
                      </div>
                      <button
                        type="button"
                        className="market-finder-compare-cancel"
                        onClick={() => {
                          setCompareOpen(false);
                          resetComparePicker();
                        }}
                      >
                        <svg
                          className="market-finder-compare-cancel-icon"
                          viewBox="0 0 20 20"
                          width="14"
                          height="14"
                          aria-hidden
                        >
                          <path
                            d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                        Cancel
                      </button>
                    </div>

                    <div className="market-finder-browse">
                      <p className="market-finder-section-label">Browse by location</p>
                      <div className="market-finder-cascade">
                        <label
                          className={compareFieldClass('region', Boolean(compareRegion))}
                        >
                          <span className="market-finder-field-label">
                            <span className="market-finder-step" aria-hidden>
                              1
                            </span>
                            Region
                          </span>
                          <select
                            value={compareRegion}
                            onChange={(event) => {
                              setCompareRegion(event.target.value);
                              setCompareProvince('');
                              setCompareCity('');
                              setComparePickId('');
                              setCompareQ('');
                            }}
                          >
                            <option value="">Select region</option>
                            {(filterTree.data?.regions ?? []).map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <span className="market-finder-cascade-arrow" aria-hidden>
                          →
                        </span>

                        <label
                          className={compareFieldClass('province', Boolean(compareProvince))}
                        >
                          <span className="market-finder-field-label">
                            <span className="market-finder-step" aria-hidden>
                              2
                            </span>
                            Province
                          </span>
                          <select
                            value={compareProvince}
                            disabled={!compareRegion}
                            onChange={(event) => {
                              setCompareProvince(event.target.value);
                              setCompareCity('');
                              setComparePickId('');
                              setCompareQ('');
                            }}
                          >
                            <option value="">
                              {compareRegion ? 'Select province' : 'Select region first'}
                            </option>
                            {compareProvinces.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <span className="market-finder-cascade-arrow" aria-hidden>
                          →
                        </span>

                        <label className={compareFieldClass('city', Boolean(compareCity))}>
                          <span className="market-finder-field-label">
                            <span className="market-finder-step" aria-hidden>
                              3
                            </span>
                            City / Municipality
                          </span>
                          <select
                            value={compareCity}
                            disabled={!compareProvince}
                            onChange={(event) => {
                              setCompareCity(event.target.value);
                              setComparePickId('');
                              setCompareQ('');
                            }}
                          >
                            <option value="">
                              {compareProvince ? 'Select city' : 'Select province first'}
                            </option>
                            {compareCities.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <span className="market-finder-cascade-arrow" aria-hidden>
                          →
                        </span>

                        <label
                          className={compareFieldClass('market', Boolean(comparePickId))}
                        >
                          <span className="market-finder-field-label">
                            <span className="market-finder-step" aria-hidden>
                              4
                            </span>
                            Market
                          </span>
                          <select
                            value={comparePickId}
                            disabled={
                              !compareRegion ||
                              compareCatalog.isLoading ||
                              !compareMarkets.length
                            }
                            onChange={(event) => {
                              const id = event.target.value;
                              setComparePickId(id);
                              const item = compareMarkets.find((market) => market.id === id);
                              if (item) selectCompareMarket(item);
                            }}
                          >
                            <option value="">
                              {!compareRegion
                                ? 'Select region first'
                                : compareCatalog.isLoading
                                  ? 'Loading markets…'
                                  : compareMarkets.length
                                    ? `Select market (${compareMarkets.length.toLocaleString()})`
                                    : 'No markets in this location'}
                            </option>
                            {compareMarkets.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.market}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="market-finder-or" role="separator">
                      <span>or search by name</span>
                    </div>

                    <label className="market-finder-search market-finder-compare-search">
                      <span className="market-finder-field-label">Search market</span>
                      <span className="market-finder-search-control">
                        <svg
                          className="market-finder-search-icon"
                          viewBox="0 0 20 20"
                          width="18"
                          height="18"
                          aria-hidden
                        >
                          <path
                            fill="currentColor"
                            d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65a1 1 0 0 1-1.42 1.42l-3.65-3.65A5.5 5.5 0 1 1 8.5 3Zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
                          />
                        </svg>
                        <input
                          value={compareQ}
                          onChange={(event) => {
                            setCompareQ(event.target.value);
                            setCompareSuggestionsOpen(true);
                          }}
                          onFocus={() => setCompareSuggestionsOpen(true)}
                          placeholder="Type a letter or market name…"
                          autoComplete="off"
                        />
                      </span>
                      {compareSuggestionsOpen && compareSearchNeedle.length >= 1 ? (
                        <div className="market-finder-suggestions" role="listbox">
                          <p className="market-finder-suggestion-hint">
                            {compareSearchNeedle.length === 1
                              ? `Markets starting with “${compareSearchNeedle.toUpperCase()}”`
                              : `Suggestions for “${compareSearchNeedle}”`}
                          </p>
                          {compareSuggestionsQuery.isFetching && !compareSuggestions.length ? (
                            <p className="market-finder-suggestion-status">
                              Searching markets…
                            </p>
                          ) : null}
                          {compareSuggestions.length ? (
                            compareSuggestions.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                role="option"
                                className="market-finder-suggestion"
                                onClick={() => selectCompareMarket(item)}
                              >
                                <span className="market-finder-suggestion-name">
                                  {highlightMarketName(item.market, compareSearchNeedle)}
                                </span>
                                <span className="market-finder-suggestion-meta">
                                  {marketLocationLabel(item)}
                                </span>
                              </button>
                            ))
                          ) : !compareSuggestionsQuery.isFetching ? (
                            <p className="market-finder-suggestion-status">
                              No matching markets.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </label>
                  </div>
                ) : null}

                {isComparing ? (
                  <div className="market-finder-compare-board">
                    <div className="market-finder-compare-summary">
                      <div className="market-finder-compare-side is-a">
                        <strong>{marketInfo?.market}</strong>
                        {marketInfo?.as_of_date ? (
                          <span className="market-finder-compare-asof">
                            As of {marketInfo.as_of_date}
                          </span>
                        ) : null}
                        <small>{marketLocationLabel(marketInfo!)}</small>
                      </div>
                      <div className="market-finder-compare-vs" aria-hidden>
                        VS
                      </div>
                      <div className="market-finder-compare-side is-b">
                        <strong>{compareMarket?.market}</strong>
                        {(compareDetail.data?.market?.as_of_date ||
                          compareMarket?.as_of_date) ? (
                          <span className="market-finder-compare-asof">
                            As of{' '}
                            {compareDetail.data?.market?.as_of_date ||
                              compareMarket?.as_of_date}
                          </span>
                        ) : null}
                        <small>{marketLocationLabel(compareMarket!)}</small>
                      </div>
                      <button
                        type="button"
                        className="market-finder-compare-change"
                        onClick={() => {
                          setCompareMarket(null);
                          resetComparePicker();
                          setCompareOpen(true);
                        }}
                      >
                        Change market
                      </button>
                    </div>

                    <div className="market-finder-compare-legend" aria-hidden>
                      <span className="is-lower">Lower price</span>
                      <span className="is-higher">Higher price</span>
                      <span className="is-even">Same price</span>
                    </div>
                  </div>
                ) : null}

                {commodities.length || isComparing ? (
                  <CategoryFilter
                    categories={commodityCategories}
                    value={category}
                    onChange={setCategory}
                  />
                ) : null}

                {detail.isFetching || (isComparing && compareDetail.isFetching) ? (
                  <div className="market-finder-loading" role="status">
                    <span className="loading-spinner is-sm" aria-hidden />
                    {isComparing ? 'Updating compared prices…' : 'Updating market prices…'}
                  </div>
                ) : null}

                {detail.isError ? (
                  <p className="status-line error">Could not load market commodities.</p>
                ) : null}
                {isComparing && compareDetail.isError ? (
                  <p className="status-line error">Could not load comparison market.</p>
                ) : null}

                {isComparing ? (
                  filteredCompareRows.length ? (
                    <div className="table-shell market-finder-table-shell">
                      <table className="data-table market-finder-table is-compare">
                        <thead>
                          <tr>
                            <th className="market-finder-col-commodity">Commodity</th>
                            <th className="num market-finder-col-price">
                              <span className="market-finder-col-title">
                                {marketInfo?.market || 'Market A'}
                              </span>
                              {marketInfo?.as_of_date ? (
                                <span className="market-finder-col-asof">
                                  As of {marketInfo.as_of_date}
                                </span>
                              ) : null}
                            </th>
                            <th className="num market-finder-col-price is-compare-b">
                              <span className="market-finder-col-title">
                                {compareMarket?.market || 'Market B'}
                              </span>
                              {(compareDetail.data?.market?.as_of_date ||
                                compareMarket?.as_of_date) ? (
                                <span className="market-finder-col-asof">
                                  As of{' '}
                                  {compareDetail.data?.market?.as_of_date ||
                                    compareMarket?.as_of_date}
                                </span>
                              ) : null}
                            </th>
                            <th className="market-finder-col-compare">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCompareRows.map((item) => {
                            const unit = priceUnit(item.commodity);
                            let leftHighlight: 'lower' | 'higher' | null = null;
                            let rightHighlight: 'lower' | 'higher' | null = null;
                            if (
                              item.leftPrice != null &&
                              item.rightPrice != null &&
                              Math.abs(item.leftPrice - item.rightPrice) >= 0.005
                            ) {
                              if (item.leftPrice < item.rightPrice) {
                                leftHighlight = 'lower';
                                rightHighlight = 'higher';
                              } else {
                                leftHighlight = 'higher';
                                rightHighlight = 'lower';
                              }
                            }
                            return (
                              <tr key={item.key}>
                                <td className="market-finder-col-commodity">
                                  <div className="market-finder-commodity-copy">
                                    {item.category_name ? (
                                      <span className="market-finder-commodity-category">
                                        <span
                                          className="market-finder-commodity-category-icon"
                                          aria-hidden
                                        >
                                          {CATEGORY_EMOJIS[item.category_name] ?? '📦'}
                                        </span>
                                        {item.category_name}
                                      </span>
                                    ) : null}
                                    <strong>{item.commodity}</strong>
                                  </div>
                                </td>
                                <td className="num market-finder-col-price">
                                  <MarketPriceCell
                                    price={item.leftPrice}
                                    unit={unit}
                                    highlight={leftHighlight}
                                  />
                                </td>
                                <td className="num market-finder-col-price is-compare-b">
                                  <MarketPriceCell
                                    price={item.rightPrice}
                                    unit={unit}
                                    highlight={rightHighlight}
                                  />
                                </td>
                                <td className="market-finder-col-compare">
                                  <CompareResult
                                    leftName={marketInfo?.market || 'Market A'}
                                    rightName={compareMarket?.market || 'Market B'}
                                    leftPrice={item.leftPrice}
                                    rightPrice={item.rightPrice}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : !compareDetail.isFetching ? (
                    <p className="empty-state">
                      {compareRows.length
                        ? 'No priced commodities in this category.'
                        : 'No priced commodities for this market.'}
                    </p>
                  ) : null
                ) : filteredCommodities.length ? (
                  <div className="table-shell market-finder-table-shell">
                    <table className="data-table market-finder-table">
                      <thead>
                        <tr>
                          <th className="market-finder-col-commodity">Commodity</th>
                          <th className="num market-finder-col-price">Market Price</th>
                          <th className="num">National Average</th>
                          <th className="num">Regional Average</th>
                          <th className="num">Provincial Average</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCommodities.map((item) => (
                          <tr
                            key={`${item.category_name}|${item.commodity}|${item.specifications}`}
                          >
                            <td className="market-finder-col-commodity">
                              <div className="market-finder-commodity-copy">
                                {item.category_name ? (
                                  <span className="market-finder-commodity-category">
                                    <span
                                      className="market-finder-commodity-category-icon"
                                      aria-hidden
                                    >
                                      {CATEGORY_EMOJIS[item.category_name] ?? '📦'}
                                    </span>
                                    {item.category_name}
                                  </span>
                                ) : null}
                                <strong>{item.commodity}</strong>
                              </div>
                            </td>
                            <td className="num market-finder-col-price">
                              <MarketPriceCell
                                price={item.price}
                                unit={priceUnit(item.commodity)}
                              />
                            </td>
                            <td className="num">
                              <AvgCell
                                avg={item.national_avg}
                                delta={item.vs_national}
                                tone={item.tone_national}
                              />
                            </td>
                            <td className="num">
                              <AvgCell
                                avg={item.regional_avg}
                                delta={item.vs_regional}
                                tone={item.tone_regional}
                              />
                            </td>
                            <td className="num">
                              <AvgCell
                                avg={item.provincial_avg}
                                delta={item.vs_provincial}
                                tone={item.tone_provincial}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : !detail.isFetching ? (
                  <p className="empty-state">
                    {commodities.length
                      ? 'No priced commodities in this category.'
                      : 'No priced commodities for this market.'}
                  </p>
                ) : null}
              </section>
        </div>
      ) : null}
    </div>
  );
}
