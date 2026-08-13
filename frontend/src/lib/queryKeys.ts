export const queryKeys = {
  health: ['health'] as const,
  dashboard: (region?: string, category?: string, province?: string, city?: string) =>
    ['dashboard', region ?? '', category ?? '', province ?? '', city ?? ''] as const,
  commodityMap: (
    category: string,
    commodity: string,
    specifications: string,
    region?: string,
    province?: string,
    city?: string,
    groupBy?: string,
  ) =>
    [
      'commodity-map',
      category,
      commodity,
      specifications,
      region ?? '',
      province ?? '',
      city ?? '',
      groupBy ?? '',
    ] as const,
  marketsCatalog: (region?: string, province?: string, city?: string, q?: string) =>
    ['markets-catalog', region ?? '', province ?? '', city ?? '', q ?? ''] as const,
  marketDetail: (market: string, region?: string, province?: string, city?: string) =>
    ['market-detail', market, region ?? '', province ?? '', city ?? ''] as const,
  filters: ['filters'] as const,
  prices: (params: Record<string, string | number | boolean | undefined>) =>
    ['prices', params] as const,
};
