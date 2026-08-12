export const queryKeys = {
  health: ['health'] as const,
  dashboard: (region?: string, category?: string, province?: string) =>
    ['dashboard', region ?? '', category ?? '', province ?? ''] as const,
  commodityMap: (
    category: string,
    commodity: string,
    specifications: string,
    region?: string,
    province?: string,
    groupBy?: string,
  ) =>
    [
      'commodity-map',
      category,
      commodity,
      specifications,
      region ?? '',
      province ?? '',
      groupBy ?? '',
    ] as const,
  filters: ['filters'] as const,
  prices: (params: Record<string, string | number | boolean | undefined>) =>
    ['prices', params] as const,
};
