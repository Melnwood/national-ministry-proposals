// Minimal CSV parser — handles quoted fields and commas inside quotes.
// Returns an array of row objects keyed by the header row.
export function parseCSV(text) {
  const rows = [];
  let field = '', row = [], inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { if (row.length > 1 || row[0] !== '') rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') pushField();
    else if (c === '\r') { /* ignore */ }
    else if (c === '\n') { pushField(); pushRow(); }
    else field += c;
  }
  if (field !== '' || row.length) { pushField(); pushRow(); }

  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return o;
  });
}

// Parse the National Expansion Projects bank export specifically.
export function parseBankCSV(text) {
  const raw = parseCSV(text).filter(r => r.Date);
  const num = v => Number(String(v || '').replace(/[$,]/g, '')) || 0;
  const txns = raw.map(r => ({
    date: r.Date, account: r.Account || '', description: r.Description || '',
    credit: num(r.Credit), debit: num(r.Debit), balance: num(r.Balance),
  }));
  const sorted = [...txns].sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = sorted[0] || null;
  return {
    txns: sorted,
    count: txns.length,
    balance: latest ? latest.balance : null,
    asOf: latest ? latest.date : '',
    totalOut: txns.reduce((a, t) => a + t.debit, 0),
    totalIn: txns.reduce((a, t) => a + t.credit, 0),
  };
}
