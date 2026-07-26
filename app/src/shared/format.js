// Formatting helpers — defined ONCE for the whole app (the old pages each had
// their own drifting copies of these).

export const money = n =>
  (n == null || n === '') ? '—' : '$' + Math.round(Number(n)).toLocaleString('en-US');

export const moneyCents = n =>
  (n == null || n === '') ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const date = d => {
  if (!d) return '—';
  const t = new Date(d);
  return isNaN(t) ? '—' : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const daysAgo = d => {
  if (!d) return null;
  const t = new Date(d);
  return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
};

// Airtable single-select / lookup values arrive as {name} objects or bare
// strings or arrays — normalize to a plain string.
export const aval = v =>
  Array.isArray(v) ? v.map(aval).filter(Boolean).join(', ')
  : (v && typeof v === 'object' && 'name' in v) ? v.name
  : (v == null ? '' : String(v));
