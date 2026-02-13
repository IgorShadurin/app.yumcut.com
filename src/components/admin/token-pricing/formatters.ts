export const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export const DECIMALS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const USD_WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
export const DECIMALS_2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
