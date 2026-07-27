import { useState, useEffect } from 'preact/hooks';
import { xlsxToSheets } from '../shared/xlsx.js';
import { docxToText } from '../shared/docx.js';

// View a budget attachment right in the app — no downloading. PDFs and
// images embed directly; Excel files are parsed in the browser and shown as
// tables; CSVs likewise; Word docs as text. Anything else falls back to a
// download link. Files are fetched through the app's own budget_file proxy,
// so ad blockers and Airtable's expiring links aren't a problem.
export function BudgetViewer({ recId, index, filename, onClose }) {
  const url = `/.netlify/functions/airtable?op=budget_file&rec=${recId}&i=${index}`;
  const name = filename || 'budget';
  const kind = /\.pdf$/i.test(name) ? 'pdf'
    : /\.(png|jpe?g|gif|webp)$/i.test(name) ? 'image'
    : /\.xlsx$/i.test(name) ? 'xlsx'
    : /\.csv$/i.test(name) ? 'csv'
    : /\.docx$/i.test(name) ? 'docx'
    : 'other';

  const [sheets, setSheets] = useState(null);
  const [text, setText] = useState('');
  const [tab, setTab] = useState(0);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(kind === 'xlsx' || kind === 'csv' || kind === 'docx');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (kind === 'xlsx') {
          const res = await fetch(url);
          if (!res.ok) throw new Error('Could not load the file.');
          const s = await xlsxToSheets(await res.arrayBuffer());
          if (!s.length) throw new Error('That spreadsheet appears to be empty.');
          if (alive) setSheets(s);
        } else if (kind === 'csv') {
          const res = await fetch(url);
          if (!res.ok) throw new Error('Could not load the file.');
          const rows = parseCSV(await res.text());
          if (alive) setSheets([{ name: 'CSV', rows }]);
        } else if (kind === 'docx') {
          const res = await fetch(url);
          if (!res.ok) throw new Error('Could not load the file.');
          const blob = await res.blob();
          const t = await docxToText(blob);
          if (alive) setText(t);
        }
      } catch (e) { if (alive) setErr(e.message || 'Could not display that file.'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [url, kind]);

  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal wide bv" onClick={e => e.stopPropagation()}>
        <div class="modal-head">
          <div><h2>Budget</h2><div class="sub2">{name}</div></div>
          <div style="display:flex;gap:8px">
            <a class="ghostbtn" href={url} target="_blank" rel="noopener">Download</a>
            <button class="ghostbtn" onClick={onClose}>Close ✕</button>
          </div>
        </div>

        {loading && <div class="bv-body"><p class="muted">Loading…</p></div>}
        {err && <div class="bv-body"><div class="editerr">{err}</div>
          <p class="muted" style="margin-top:8px;font-size:12.5px">You can still download it with the button above.</p></div>}

        {kind === 'pdf' && <iframe class="bv-frame" src={url} title={name} />}
        {kind === 'image' && <div class="bv-body"><img class="bv-img" src={url} alt={name} /></div>}

        {sheets && (
          <div class="bv-body">
            {sheets.length > 1 && (
              <div class="subtabs" style="margin-bottom:10px">
                {sheets.map((s, i) => (
                  <button class={`subtab${tab === i ? ' on' : ''}`} onClick={() => setTab(i)}>{s.name}</button>
                ))}
              </div>
            )}
            <div class="tablewrap bv-sheet">
              <table class="grants">
                <tbody>
                  {(sheets[Math.min(tab, sheets.length - 1)].rows).map(r => (
                    <tr>{Array.from({ length: Math.max(r.length, 1) }, (_, i) => <td>{r[i] ?? ''}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {kind === 'docx' && text && <div class="bv-body"><p class="fittext">{text}</p></div>}

        {kind === 'other' && !loading && !err && (
          <div class="bv-body"><p class="muted">This file type can't be previewed in the browser — use the Download button above.</p></div>
        )}
      </div>
    </div>
  );
}

// Small CSV parser — quoted fields, commas, newlines.
function parseCSV(txt) {
  const rows = [[]]; let cur = '', inQ = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (inQ) {
      if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { rows[rows.length - 1].push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (cur !== '' || rows[rows.length - 1].length) { rows[rows.length - 1].push(cur); cur = ''; }
      if (ch === '\n' && (rows[rows.length - 1].length)) rows.push([]);
    } else cur += ch;
  }
  if (cur !== '' || rows[rows.length - 1].length) rows[rows.length - 1].push(cur);
  return rows.filter(r => r.length && r.some(c => c !== ''));
}
