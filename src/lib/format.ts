const tlFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 2,
});

export const formatMoney = (n: number, currency = 'TRY') => {
  if (currency === 'TRY') return tlFormatter.format(n);
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(n);
};

export const formatNumber = (n: number, fractionDigits = 2) =>
  new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);

export const formatCompact = (n: number) =>
  new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export const formatPct = (n: number, fractionDigits = 2) =>
  `${n >= 0 ? '+' : ''}${n.toFixed(fractionDigits)}%`;
