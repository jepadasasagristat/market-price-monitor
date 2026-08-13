import type { CommodityMapArea, CommodityMapResponse } from '@/api/prices';
import { CATEGORY_EMOJIS } from '@/components/filters/categoryIcons';
import { formatPrice, priceUnit } from '@/lib/format';

type CommoditySummary = {
  category_name: string;
  commodity: string;
  specifications: string;
  avg_price: number;
  national_avg: number;
  min_price: number;
  max_price: number;
  observations: number;
};

type CommodityDetailPanelProps = {
  item: CommoditySummary;
  comparison?: CommodityMapResponse;
  comparisonLabel: string;
  scopeContext: string;
  regionalAvg?: number;
  provincialAvg?: number;
  localAvgLabel?: string;
  marketSuggestion?: CommodityMapResponse;
  compareMode?: 'province' | 'city' | 'market';
  compareAreaMode?: 'province' | 'city';
  onCompareModeChange?: (mode: 'province' | 'city' | 'market') => void;
  highlightedAreaId?: string | null;
  onHoverArea?: (areaId: string | null) => void;
  isLoading?: boolean;
  onClose: () => void;
};

function vsReferenceAvg(avg: number, referenceAvg: number) {
  const delta = avg - referenceAvg;
  if (Math.abs(delta) < 0.005) {
    return { tone: 'even' as const, delta: 0 };
  }
  if (delta < 0) {
    return { tone: 'below' as const, delta };
  }
  return { tone: 'above' as const, delta };
}

function vsNationalLabel(avg: number, nationalAvg: number) {
  const result = vsReferenceAvg(avg, nationalAvg);
  if (result.tone === 'even') {
    return { ...result, label: 'At national avg' };
  }
  if (result.tone === 'below') {
    return { ...result, label: 'Below national avg' };
  }
  return { ...result, label: 'Above national avg' };
}

function formatVsAvgDelta(delta: number) {
  if (Math.abs(delta) < 0.005) return 'At avg';
  return delta > 0 ? `+${formatPrice(delta)}` : formatPrice(delta);
}

function AreaNameCell({
  area,
  groupBy,
}: {
  area: CommodityMapArea;
  groupBy?: CommodityMapResponse['group_by'];
}) {
  if (groupBy === 'market') {
    const market = area.market ?? area.name.split(',')[0]?.trim() ?? area.name;
    const city =
      area.city_municipality ?? area.name.includes(',')
        ? area.name.split(',').slice(1).join(',').trim()
        : '';

    return (
      <th scope="row">
        <span className="commodity-detail-area-name">{market}</span>
        {city ? <span className="commodity-detail-area-subname">{city}</span> : null}
      </th>
    );
  }

  return <th scope="row">{area.name}</th>;
}

function groupColumnLabel(groupBy?: CommodityMapResponse['group_by']) {
  if (groupBy === 'market') return 'Local Market (Palengke)';
  if (groupBy === 'province') return 'Province';
  if (groupBy === 'city') return 'City';
  return 'Region';
}

function marketDisplayName(area: CommodityMapArea) {
  const market = area.market ?? area.name.split(',')[0]?.trim() ?? area.name;
  const city =
    area.city_municipality ??
    (area.name.includes(',') ? area.name.split(',').slice(1).join(',').trim() : '');
  return { market, city };
}

function formatSavingsChip(delta: number, tone: 'above' | 'below' | 'even', label: string) {
  if (tone === 'even') {
    return { tone, text: `At ${label}` };
  }
  const amount = formatPrice(Math.abs(delta));
  return {
    tone,
    text: tone === 'below' ? `${amount} below ${label}` : `${amount} above ${label}`,
  };
}

function MarketPriceSuggestion({
  market,
  nationalAvg,
  regionalAvg,
  provincialAvg,
  localScopeLabel = 'provincial avg',
  scopeContext,
  tiedCount,
}: {
  market: CommodityMapArea;
  nationalAvg: number;
  regionalAvg?: number;
  provincialAvg?: number;
  localScopeLabel?: string;
  scopeContext: string;
  tiedCount: number;
}) {
  const { market: marketName, city } = marketDisplayName(market);
  const vsNational = vsReferenceAvg(market.avg_price, nationalAvg);
  const vsRegional =
    regionalAvg != null ? vsReferenceAvg(market.avg_price, regionalAvg) : null;
  const vsLocal =
    provincialAvg != null ? vsReferenceAvg(market.avg_price, provincialAvg) : null;

  let headline = 'Cheapest nationwide';
  if (provincialAvg != null || regionalAvg != null) {
    headline = `Cheapest in ${scopeContext}`;
  }

  const nationalChip = formatSavingsChip(vsNational.delta, vsNational.tone, 'national avg');
  const regionalChip =
    vsRegional != null
      ? formatSavingsChip(vsRegional.delta, vsRegional.tone, 'regional avg')
      : null;
  const localChip =
    vsLocal != null
      ? formatSavingsChip(vsLocal.delta, vsLocal.tone, localScopeLabel)
      : null;

  return (
    <aside className="commodity-detail-suggestion" aria-label="Lowest price suggestion">
      <div className="commodity-detail-suggestion-main">
        <div className="commodity-detail-suggestion-top">
          <span className="commodity-detail-suggestion-badge">
            <svg viewBox="0 0 20 20" aria-hidden>
              <path
                d="M10 2.8 11.9 7.2l4.8.4-3.6 3.1 1.1 4.7L10 13.2 5.8 15.4l1.1-4.7-3.6-3.1 4.8-.4L10 2.8Z"
                fill="currentColor"
              />
            </svg>
            Best deal
          </span>
          <span className="commodity-detail-suggestion-scope">{headline}</span>
        </div>

        <div className="commodity-detail-suggestion-place">
          <p className="commodity-detail-suggestion-market">{marketName}</p>
          {city ? (
            <p className="commodity-detail-suggestion-city">
              <svg viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M8 1.6c-2.4 0-4.4 1.9-4.4 4.3 0 3.2 4.4 8.5 4.4 8.5s4.4-5.3 4.4-8.5C12.4 3.5 10.4 1.6 8 1.6Zm0 5.9A1.7 1.7 0 1 1 8 4.2a1.7 1.7 0 0 1 0 3.3Z"
                  fill="currentColor"
                />
              </svg>
              {city}
            </p>
          ) : null}
        </div>

        <div className="commodity-detail-suggestion-chips">
          <span className={`commodity-detail-suggestion-chip is-${nationalChip.tone}`}>
            {nationalChip.text}
          </span>
          {regionalChip ? (
            <span className={`commodity-detail-suggestion-chip is-${regionalChip.tone}`}>
              {regionalChip.text}
            </span>
          ) : null}
          {localChip ? (
            <span className={`commodity-detail-suggestion-chip is-${localChip.tone}`}>
              {localChip.text}
            </span>
          ) : null}
          {tiedCount > 1 ? (
            <span className="commodity-detail-suggestion-chip is-tie">
              Tied with {tiedCount - 1} other market{tiedCount - 1 === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>

      <div className="commodity-detail-suggestion-pricebox">
        <p className="commodity-detail-suggestion-price-label">Average price</p>
        <p className="commodity-detail-suggestion-price">{formatPrice(market.avg_price)}</p>
      </div>
    </aside>
  );
}

function CompareTabIcon({ type }: { type: 'province' | 'city' | 'market' }) {
  if (type === 'province' || type === 'city') {
    return (
      <svg className="commodity-detail-compare-tab-icon" viewBox="0 0 20 20" aria-hidden>
        <path
          d="M3.5 5.5 10 2.5l6.5 3v9L10 17.5 3.5 14.5v-9Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M10 6.5v11M3.5 5.5 10 8.5l6.5-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg className="commodity-detail-compare-tab-icon" viewBox="0 0 20 20" aria-hidden>
      <path
        d="M4 8.5V16h12V8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 8.5h14l-1.4-3.2H4.4L3 8.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function CommodityDetailPanel({
  item,
  comparison,
  comparisonLabel,
  scopeContext,
  regionalAvg,
  provincialAvg,
  localAvgLabel = 'Provincial Average',
  marketSuggestion,
  compareMode,
  compareAreaMode = 'province',
  onCompareModeChange,
  highlightedAreaId,
  onHoverArea,
  isLoading,
  onClose,
}: CommodityDetailPanelProps) {
  const nationalAvg = comparison?.national_avg ?? item.national_avg;
  const vs = vsNationalLabel(item.avg_price, nationalAvg);
  const areas = comparison?.areas ?? [];
  const isMarketComparison = comparison?.group_by === 'market';
  const showRangeAndAvailability = !isMarketComparison;
  const suggestionSource = marketSuggestion ?? (isMarketComparison ? comparison : undefined);
  const suggestionMarket = suggestionSource?.areas[0];
  const tiedLowestCount =
    suggestionSource?.areas.filter(
      (area) =>
        suggestionMarket &&
        Math.abs(area.avg_price - suggestionMarket.avg_price) < 0.005,
    ).length ?? 0;

  return (
    <article className={`commodity-detail${isLoading ? ' is-loading' : ''}`} aria-busy={isLoading}>
      {isLoading ? <div className="commodity-detail-loading-bar" aria-hidden /> : null}
      <div className="commodity-detail-toolbar">
        <button type="button" className="commodity-detail-back" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path
              d="M10 3.5 5.5 8 10 12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to list
        </button>
        <div className="commodity-detail-toolbar-meta">
          {isLoading ? (
            <span className="commodity-detail-loading-pill" role="status" aria-live="polite">
              <span className="loading-spinner is-sm" aria-hidden />
              Updating…
            </span>
          ) : null}
          <p className="commodity-detail-scope">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
              <path
                d="M8 1.6c-2.3 0-4.2 1.8-4.2 4.1 0 3.1 4.2 8.1 4.2 8.1s4.2-5 4.2-8.1C12.2 3.4 10.3 1.6 8 1.6Zm0 5.8A1.7 1.7 0 1 1 8 4a1.7 1.7 0 0 1 0 3.4Z"
                fill="currentColor"
              />
            </svg>
            {scopeContext}
          </p>
        </div>
      </div>

      <header className={`commodity-detail-header is-${vs.tone}`}>
        <div className="commodity-detail-header-main">
          <p className="commodity-detail-category">
            <span className="commodity-detail-category-icon" aria-hidden>
              {CATEGORY_EMOJIS[item.category_name] ?? '📦'}
            </span>
            {item.category_name || 'Uncategorized'}
          </p>
          <h2 className="commodity-detail-name">{item.commodity}</h2>
        </div>
        <div className="commodity-detail-hero">
          <div className="commodity-detail-price-block">
            <p className="commodity-detail-price-label">Average market price</p>
            <p className="commodity-detail-price">
              {formatPrice(item.avg_price)}
              <span className="commodity-detail-price-unit">{priceUnit(item.commodity)}</span>
            </p>
          </div>
          <div className="commodity-detail-hero-meta">
            <p className={`commodity-detail-flag is-${vs.tone}`}>{vs.label}</p>
            {vs.tone !== 'even' ? (
              <p className={`commodity-detail-delta is-${vs.tone}`}>
                {formatVsAvgDelta(vs.delta)} vs national
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <section className="commodity-detail-summary" aria-label="Price overview">
        <div className="commodity-detail-summary-head">
          <h3>Price overview</h3>
          <p>
            National benchmarks
            {regionalAvg != null || provincialAvg != null ? ' with your selected area' : ''}
            , price range, and market coverage.
          </p>
        </div>
        <dl className="commodity-detail-summary-grid">
          <div className="is-national">
            <dt>National avg</dt>
            <dd>{formatPrice(comparison?.national_avg ?? item.national_avg)}</dd>
          </div>
          {regionalAvg != null ? (
            <div className="is-regional">
              <dt>Regional avg</dt>
              <dd>{formatPrice(regionalAvg)}</dd>
            </div>
          ) : null}
          {provincialAvg != null ? (
            <div className="is-local">
              <dt>{localAvgLabel.replace(/ Average$/i, ' avg')}</dt>
              <dd>{formatPrice(provincialAvg)}</dd>
            </div>
          ) : null}
          <div className="is-low">
            <dt>Lowest</dt>
            <dd>{formatPrice(comparison?.national_min ?? item.min_price)}</dd>
          </div>
          <div className="is-high">
            <dt>Highest</dt>
            <dd>{formatPrice(comparison?.national_max ?? item.max_price)}</dd>
          </div>
          <div className="is-coverage">
            <dt>Markets Available</dt>
            <dd>{(comparison?.national_observations ?? item.observations).toLocaleString()}</dd>
          </div>
        </dl>

        {suggestionMarket ? (
          <MarketPriceSuggestion
            market={suggestionMarket}
            nationalAvg={nationalAvg}
            regionalAvg={regionalAvg}
            provincialAvg={provincialAvg}
            localScopeLabel={
              localAvgLabel.toLowerCase().includes('city') ? 'city avg' : 'provincial avg'
            }
            scopeContext={scopeContext}
            tiedCount={tiedLowestCount || 1}
          />
        ) : null}
      </section>

      <section className="commodity-detail-compare" aria-label={comparisonLabel}>
        <div className="commodity-detail-compare-head">
          <div className="commodity-detail-compare-title">
            <h3>{compareMode ? 'Price comparison' : comparisonLabel}</h3>
            {compareMode && onCompareModeChange ? (
              <div className="commodity-detail-compare-tabs" role="tablist" aria-label="Comparison view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={compareMode === compareAreaMode}
                  className={compareMode === compareAreaMode ? 'is-active' : ''}
                  onClick={() => onCompareModeChange(compareAreaMode)}
                >
                  <CompareTabIcon type={compareAreaMode} />
                  {compareAreaMode === 'city' ? 'By city' : 'By province'}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={compareMode === 'market'}
                  className={compareMode === 'market' ? 'is-active' : ''}
                  onClick={() => onCompareModeChange('market')}
                >
                  <CompareTabIcon type="market" />
                  By market
                </button>
              </div>
            ) : null}
          </div>
          <p className="commodity-detail-compare-note">
            Compared against the nationwide average of {formatPrice(nationalAvg)}
            {regionalAvg != null ? ` and regional average of ${formatPrice(regionalAvg)}` : ''}
            {provincialAvg != null
              ? ` and ${localAvgLabel.toLowerCase()} of ${formatPrice(provincialAvg)}`
              : ''}
            .
          </p>
        </div>

        {areas.length ? (
          <div
            className="commodity-detail-table-wrap"
            onMouseLeave={() => onHoverArea?.(null)}
          >
            <table className="commodity-detail-table">
              <thead>
                <tr>
                  <th scope="col">{groupColumnLabel(comparison?.group_by)}</th>
                  <th scope="col">{isMarketComparison ? 'Market Price' : 'Average Price'}</th>
                  {showRangeAndAvailability ? <th scope="col">Range</th> : null}
                  <th scope="col">vs nationwide avg.</th>
                  {regionalAvg != null ? <th scope="col">vs regional avg.</th> : null}
                  {provincialAvg != null ? (
                    <th scope="col">
                      {localAvgLabel.toLowerCase().includes('city')
                        ? 'vs city avg.'
                        : 'vs provincial avg.'}
                    </th>
                  ) : null}
                  {showRangeAndAvailability ? <th scope="col">Markets Available</th> : null}
                </tr>
              </thead>
              <tbody>
                {areas.map((area) => {
                  const areaVs = vsReferenceAvg(area.avg_price, nationalAvg);
                  const areaRegionalVs =
                    regionalAvg != null ? vsReferenceAvg(area.avg_price, regionalAvg) : null;
                  const areaProvincialVs =
                    provincialAvg != null ? vsReferenceAvg(area.avg_price, provincialAvg) : null;
                  const isHighlighted = highlightedAreaId === area.id;
                  return (
                    <tr
                      key={area.id}
                      className={[`is-${area.tone}`, isHighlighted ? 'is-map-linked' : '']
                        .filter(Boolean)
                        .join(' ')}
                      onMouseEnter={() => onHoverArea?.(area.id)}
                      onFocus={() => onHoverArea?.(area.id)}
                      onBlur={() => onHoverArea?.(null)}
                    >
                      <AreaNameCell area={area} groupBy={comparison?.group_by} />
                      <td className="commodity-detail-price-cell">{formatPrice(area.avg_price)}</td>
                      {showRangeAndAvailability ? (
                        <td>
                          {formatPrice(area.min_price)} – {formatPrice(area.max_price)}
                        </td>
                      ) : null}
                      <td>
                        <span className={`commodity-detail-vs is-${areaVs.tone}`}>
                          {formatVsAvgDelta(areaVs.delta)}
                        </span>
                      </td>
                      {areaRegionalVs ? (
                        <td>
                          <span className={`commodity-detail-vs is-${areaRegionalVs.tone}`}>
                            {formatVsAvgDelta(areaRegionalVs.delta)}
                          </span>
                        </td>
                      ) : null}
                      {areaProvincialVs ? (
                        <td>
                          <span className={`commodity-detail-vs is-${areaProvincialVs.tone}`}>
                            {formatVsAvgDelta(areaProvincialVs.delta)}
                          </span>
                        </td>
                      ) : null}
                      {showRangeAndAvailability ? (
                        <td>{area.observations.toLocaleString()}</td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No comparison data for this scope.</p>
        )}
      </section>
    </article>
  );
}
