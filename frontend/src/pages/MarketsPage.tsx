import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDashboard } from '@/api/prices';
import { queryKeys } from '@/lib/queryKeys';
import PageHeader from '@/components/ui/PageHeader';
import MarketsMap from '@/components/map/MarketsMap';

export default function MarketsPage() {
  const [region, setRegion] = useState('');
  const [q, setQ] = useState('');

  const summary = useQuery({
    queryKey: queryKeys.dashboard(region || undefined, undefined),
    queryFn: () => fetchDashboard({ region: region || undefined }),
  });

  const markets = useMemo(() => {
    const items = summary.data?.mapped_markets ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.market, item.city_municipality, item.province, item.region_name]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [summary.data, q]);

  return (
    <div className="page">
      <PageHeader
        title="Markets"
        description="Palengkes with coordinates from the Latest sheet."
        meta={`${markets.length.toLocaleString()} mapped`}
      />

      <section className="filter-bar">
        <label>
          Region
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All regions</option>
            {(summary.data?.regions ?? []).map((name) => (
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
            placeholder="Market or city…"
          />
        </label>
      </section>

      <section className="panel">
        <MarketsMap markets={markets} />
      </section>

      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>Market</th>
              <th>City / Municipality</th>
              <th>Province</th>
              <th>Region</th>
              <th className="num">Lat</th>
              <th className="num">Lng</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((item) => (
              <tr key={`${item.region_name}-${item.market}`}>
                <td>{item.market}</td>
                <td>{item.city_municipality || '—'}</td>
                <td>{item.province || '—'}</td>
                <td>{item.region_name}</td>
                <td className="num">{item.lat.toFixed(4)}</td>
                <td className="num">{item.lng.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
