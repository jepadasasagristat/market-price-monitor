import client from './client';

export type PriceRow = {
  scraped_at: string;
  as_of_date: string;
  as_of_date_iso: string;
  region_code: string;
  region_name: string;
  province: string;
  city_municipality: string;
  category_code: string;
  category_name: string;
  commodity: string;
  specifications: string;
  market: string;
  lat: number | null;
  lng: number | null;
  price: number | null;
  price_raw: string;
};

export type DashboardSummary = {
  meta: {
    as_of_date: string;
    scraped_at: string;
    source: string;
    row_count: number;
  };
  counts: {
    rows: number;
    priced_rows: number;
    regions: number;
    categories: number;
    markets: number;
    commodities: number;
    mapped_markets: number;
  };
  regions: string[];
  categories: string[];
  provinces: string[];
  category_counts: { name: string; rows: number }[];
  region_counts: { name: string; rows: number }[];
  top_commodities: {
    category_name: string;
    commodity: string;
    specifications: string;
    avg_price: number;
    national_avg: number;
    min_price: number;
    max_price: number;
    observations: number;
  }[];
  mapped_markets: {
    region_name: string;
    province: string;
    city_municipality: string;
    market: string;
    lat: number;
    lng: number;
  }[];
};

export type PricesResponse = {
  meta: {
    as_of_date: string;
    source: string;
    total: number;
    limit: number;
    offset: number;
  };
  items: PriceRow[];
};

export type FiltersResponse = {
  source: string;
  regions: string[];
  categories: string[];
  commodities: string[];
  markets: string[];
};

export type PriceQuery = {
  region?: string;
  category?: string;
  commodity?: string;
  market?: string;
  q?: string;
  priced_only?: boolean;
  limit?: number;
  offset?: number;
  refresh?: boolean;
};

export async function fetchDashboard(params?: {
  region?: string;
  category?: string;
  province?: string;
  refresh?: boolean;
}) {
  const { data } = await client.get<DashboardSummary>('/dashboard/summary', { params });
  return data;
}

export type CommodityMapArea = {
  id: string;
  name: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  tone: 'above' | 'below';
  observations: number;
  lat?: number;
  lng?: number;
  market?: string;
  city_municipality?: string;
};

export type CommodityMapResponse = {
  category_name: string;
  commodity: string;
  specifications: string;
  national_avg: number | null;
  national_min: number | null;
  national_max: number | null;
  national_observations: number;
  group_by: 'region' | 'province' | 'market';
  areas: CommodityMapArea[];
};

export async function fetchCommodityMap(params: {
  category: string;
  commodity: string;
  specifications?: string;
  region?: string;
  province?: string;
  group_by?: 'region' | 'province' | 'market';
  refresh?: boolean;
}) {
  const { data } = await client.get<CommodityMapResponse>('/dashboard/commodity-map', { params });
  return data;
}

export async function fetchPrices(params?: PriceQuery) {
  const { data } = await client.get<PricesResponse>('/prices', { params });
  return data;
}

export async function fetchFilters(refresh = false) {
  const { data } = await client.get<FiltersResponse>('/prices/filters', {
    params: { refresh },
  });
  return data;
}

export async function fetchHealth() {
  const { data } = await client.get<{
    status: string;
    service: string;
    data_source: string;
    row_count: number;
  }>('/health');
  return data;
}
