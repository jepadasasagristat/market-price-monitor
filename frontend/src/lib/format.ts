export function formatPrice(value: number | string | null | undefined) {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(amount);
}
