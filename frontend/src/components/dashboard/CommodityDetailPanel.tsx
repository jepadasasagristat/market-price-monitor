import type { CommodityMapArea, CommodityMapResponse } from '@/api/prices';
import { CATEGORY_EMOJIS } from '@/components/filters/categoryIcons';
import { formatPrice } from '@/lib/format';

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
  marketSuggestion?: CommodityMapResponse;
  compareMode?: 'province' | 'market';
  onCompareModeChange?: (mode: 'province' | 'market') => void;
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
    return { ...result, label: 'At nationwide average' };
  }
  if (result.tone === 'below') {
    return { ...result, label: 'Below average market price' };
  }
  return { ...result, label: 'Above average market price' };
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
  if (groupBy === 'market') return 'Market';
  if (groupBy === 'province') return 'Province';
  return 'Region';
}

function marketDisplayName(area: CommodityMapArea) {
  const market = area.market ?? area.name.split(',')[0]?.trim() ?? area.name;
  const city =
    area.city_municipality ??
    (area.name.includes(',') ? area.name.split(',').slice(1).join(',').trim() : '');
  return { market, city };
}

function MarketPriceSuggestion({
  market,
  nationalAvg,
  regionalAvg,
  provincialAvg,
  scopeContext,
  tiedCount,
}: {
  market: CommodityMapArea;
  nationalAvg: number;
  regionalAvg?: number;
  provincialAvg?: number;
  scopeContext: string;
  tiedCount: number;
}) {
  const { market: marketName, city } = marketDisplayName(market);
  const vsNational = vsReferenceAvg(market.avg_price, nationalAvg);
  const scopeAvg = provincialAvg ?? regionalAvg;
  const vsScope = scopeAvg != null ? vsReferenceAvg(market.avg_price, scopeAvg) : null;

  let headline = 'Cheapest nationwide';
  if (provincialAvg != null) {
    headline = `Cheapest in ${scopeContext}`;
  } else if (regionalAvg != null) {
    headline = `Cheapest in ${scopeContext}`;
  }

  const tieNote =
    tiedCount > 1 ? ` (tied with ${tiedCount - 1} other market${tiedCount - 1 === 1 ? '' : 's'})` : '';

  return (
    <aside className="commodity-detail-suggestion" aria-label="Lowest price suggestion">
      <div className="commodity-detail-suggestion-icon" aria-hidden>
        <svg viewBox="0 0 20 20">
          <path
            d="M10 2.5 12.2 7.4l5.4.4-4.1 3.5 1.2 5.3L10 14.3l-4.7 2.3 1.2-5.3-4.1-3.5 5.4-.4L10 2.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="commodity-detail-suggestion-body">
        <p className="commodity-detail-suggestion-label">{headline}{tieNote}</p>
        <p className="commodity-detail-suggestion-market">
          {marketName}
          {city ? <span className="commodity-detail-suggestion-city">{city}</span> : null}
        </p>
        <p className="commodity-detail-suggestion-price">{formatPrice(market.avg_price)}</p>
        <p className="commodity-detail-suggestion-note">
          {vsNational.tone === 'below' ? (
            <>
              <strong>{formatPrice(Math.abs(vsNational.delta))} below</strong> the national average
            </>
          ) : vsNational.tone === 'above' ? (
            <>
              <strong>{formatPrice(vsNational.delta)} above</strong> the national average
            </>
          ) : (
            <>Matches the national average</>
          )}
          {vsScope && scopeAvg != null ? (
            <>
              {' '}
              and is{' '}
              {vsScope.tone === 'below' ? (
                <>
                  <strong>{formatPrice(Math.abs(vsScope.delta))} below</strong>
                </>
              ) : vsScope.tone === 'above' ? (
                <>
                  <strong>{formatPrice(vsScope.delta)} above</strong>
                </>
              ) : (
                <>at</>
              )}{' '}
              the {provincialAvg != null ? 'provincial' : 'regional'} average.
            </>
          ) : (
            '.'
          )}
        </p>
      </div>
    </aside>
  );
}

function CompareTabIcon({ type }: { type: 'province' | 'market' }) {
  if (type === 'province') {
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
  marketSuggestion,
  compareMode,
  onCompareModeChange,
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
    <article className={`commodity-detail${isLoading ? ' is-loading' : ''}`}>
      <div className="commodity-detail-toolbar">
        <button type="button" className="commodity-detail-back" onClick={onClose}>
          Back to list
        </button>
        <p className="commodity-detail-scope">{scopeContext}</p>
      </div>

      <header className="commodity-detail-header">
        <p className="commodity-detail-category">
          <span aria-hidden>{CATEGORY_EMOJIS[item.category_name] ?? '📦'}</span>
          {item.category_name || 'Uncategorized'}
        </p>
        <h2 className="commodity-detail-name">{item.commodity}</h2>
        <p className="commodity-detail-spec">{item.specifications || 'No specification'}</p>
        <div className="commodity-detail-hero">
          <div>
            <p className="commodity-detail-price-label">Average Market Price</p>
            <p className="commodity-detail-price">{formatPrice(item.avg_price)}</p>
          </div>
          <p className={`commodity-detail-flag is-${vs.tone}`}>{vs.label}</p>
        </div>
      </header>

      <section className="commodity-detail-summary" aria-label="Nationwide summary">
        <h3>Nationwide summary</h3>
        <dl className="commodity-detail-summary-grid">
          <div>
            <dt>National Average</dt>
            <dd>{formatPrice(comparison?.national_avg ?? item.national_avg)}</dd>
          </div>
          {regionalAvg != null ? (
            <div>
              <dt>Regional Average</dt>
              <dd>{formatPrice(regionalAvg)}</dd>
            </div>
          ) : null}
          {provincialAvg != null ? (
            <div>
              <dt>Provincial Average</dt>
              <dd>{formatPrice(provincialAvg)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Lowest</dt>
            <dd>{formatPrice(comparison?.national_min ?? item.min_price)}</dd>
          </div>
          <div>
            <dt>Highest</dt>
            <dd>{formatPrice(comparison?.national_max ?? item.max_price)}</dd>
          </div>
          <div>
            <dt>Market Available</dt>
            <dd>{(comparison?.national_observations ?? item.observations).toLocaleString()}</dd>
          </div>
        </dl>

        {suggestionMarket ? (
          <MarketPriceSuggestion
            market={suggestionMarket}
            nationalAvg={nationalAvg}
            regionalAvg={regionalAvg}
            provincialAvg={provincialAvg}
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
                  aria-selected={compareMode === 'province'}
                  className={compareMode === 'province' ? 'is-active' : ''}
                  onClick={() => onCompareModeChange('province')}
                >
                  <CompareTabIcon type="province" />
                  By province
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
            {regionalAvg != null ? ` and regional average of ${formatPrice(regionalAvg)}` : ''}.
          </p>
        </div>

        {areas.length ? (
          <div className="commodity-detail-table-wrap">
            <table className="commodity-detail-table">
              <thead>
                <tr>
                  <th scope="col">{groupColumnLabel(comparison?.group_by)}</th>
                  <th scope="col">Average Price</th>
                  {showRangeAndAvailability ? <th scope="col">Range</th> : null}
                  <th scope="col">vs nationwide avg.</th>
                  {regionalAvg != null ? <th scope="col">vs regional avg.</th> : null}
                  {showRangeAndAvailability ? <th scope="col">Market Available</th> : null}
                </tr>
              </thead>
              <tbody>
                {areas.map((area) => {
                  const areaVs = vsReferenceAvg(area.avg_price, nationalAvg);
                  const areaRegionalVs =
                    regionalAvg != null ? vsReferenceAvg(area.avg_price, regionalAvg) : null;
                  return (
                    <tr key={area.id} className={`is-${area.tone}`}>
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
