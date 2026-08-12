import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFilters, fetchPrices } from '@/api/prices';
import { formatPrice } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import PageHeader from '@/components/ui/PageHeader';

export default function PricesPage() {
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('');
  const [commodity, setCommodity] = useState('');
  const [q, setQ] = useState('');
  const [pricedOnly, setPricedOnly] = useState(true);

  const filters = useQuery({
    queryKey: queryKeys.filters,
    queryFn: () => fetchFilters(),
  });

  const params = {
    region: region || undefined,
    category: category || undefined,
    commodity: commodity || undefined,
    q: q || undefined,
    priced_only: pricedOnly,
    limit: 1000,
  };

  const prices = useQuery({
    queryKey: queryKeys.prices(params),
    queryFn: () => fetchPrices(params),
  });

  const commodities = useMemo(() => {
    const all = filters.data?.commodities ?? [];
    if (!category) return all;
    const items = prices.data?.items ?? [];
    const set = new Set(items.map((row) => row.commodity));
    return all.filter((name) => set.has(name) || !category);
  }, [filters.data, prices.data, category]);

  return (
    <div className="page">
      <PageHeader
        title="Commodity prices"
        description="Browse Latest sheet rows by region, category, commodity, and market."
        meta={
          prices.data?.meta.as_of_date
            ? `As of ${prices.data.meta.as_of_date} · ${prices.data.meta.total.toLocaleString()} rows`
            : undefined
        }
      />

      <section className="filter-bar wrap">
        <label>
          Region
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All</option>
            {(filters.data?.regions ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setCommodity('');
            }}
          >
            <option value="">All</option>
            {(filters.data?.categories ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Commodity
          <select value={commodity} onChange={(e) => setCommodity(e.target.value)}>
            <option value="">All</option>
            {commodities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Market, province, specification…"
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={pricedOnly}
            onChange={(e) => setPricedOnly(e.target.checked)}
          />
          Priced only
        </label>
      </section>

      {prices.isLoading ? <p className="status-line">Loading prices…</p> : null}
      {prices.isError ? <p className="status-line error">Could not load prices.</p> : null}

      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>Commodity</th>
              <th>Specification</th>
              <th>Market</th>
              <th>City</th>
              <th>Region</th>
              <th>Category</th>
              <th className="num">Price</th>
            </tr>
          </thead>
          <tbody>
            {(prices.data?.items ?? []).map((row, index) => (
              <tr key={`${row.region_code}-${row.market}-${row.commodity}-${index}`}>
                <td>{row.commodity}</td>
                <td>{row.specifications || '—'}</td>
                <td>{row.market}</td>
                <td>{row.city_municipality || row.province || '—'}</td>
                <td>{row.region_name}</td>
                <td>{row.category_name}</td>
                <td className="num">{formatPrice(row.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!prices.isLoading && (prices.data?.items.length ?? 0) === 0 ? (
          <p className="empty-state">No rows match the current filters.</p>
        ) : null}
      </div>
    </div>
  );
}
