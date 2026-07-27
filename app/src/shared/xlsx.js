// Read an .xlsx into plain rows, in the browser, for the budget viewer.
// Handles shared strings, inline strings, and plain values — which covers
// the ordinary budget spreadsheets countries upload. No libraries.

import { zipEntries, zipRead, decodeEntities } from './zip.js';

const colIndex = ref => {
  let n = 0;
  for (const ch of ref) {
    if (ch >= 'A' && ch <= 'Z') n = n * 26 + (ch.charCodeAt(0) - 64);
    else break;
  }
  return n - 1;
};

export async function xlsxToSheets(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const entries = zipEntries(buf);

  // Shared strings (cell type t="s" points into this list).
  let shared = [];
  if (entries['xl/sharedStrings.xml']) {
    const xml = new TextDecoder().decode(await zipRead(buf, entries['xl/sharedStrings.xml']));
    shared = (xml.match(/<si>[\s\S]*?<\/si>/g) || []).map(si =>
      decodeEntities((si.match(/<t[^>]*>([^<]*)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')));
  }

  // Sheet display names, in order (workbook.xml lists them in tab order).
  let names = [];
  if (entries['xl/workbook.xml']) {
    const xml = new TextDecoder().decode(await zipRead(buf, entries['xl/workbook.xml']));
    names = (xml.match(/<sheet [^>]*name="([^"]*)"/g) || []).map(m => decodeEntities(m.match(/name="([^"]*)"/)[1]));
  }

  const sheetPaths = Object.keys(entries)
    .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  const sheets = [];
  for (let s = 0; s < sheetPaths.length; s++) {
    const xml = new TextDecoder().decode(await zipRead(buf, entries[sheetPaths[s]]));
    const rows = [];
    for (const rowXml of xml.match(/<row [^>]*>[\s\S]*?<\/row>/g) || []) {
      const cells = [];
      for (const cellXml of rowXml.match(/<c [^>]*(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
        const ref = (cellXml.match(/r="([A-Z]+)\d+"/) || [])[1] || '';
        const type = (cellXml.match(/t="([^"]*)"/) || [])[1] || '';
        let val = '';
        if (type === 'inlineStr') {
          val = decodeEntities((cellXml.match(/<t[^>]*>([^<]*)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));
        } else {
          const v = (cellXml.match(/<v>([^<]*)<\/v>/) || [])[1];
          if (v == null) continue;
          val = type === 's' ? (shared[Number(v)] ?? '') : decodeEntities(v);
        }
        if (val === '') continue;
        cells[ref ? colIndex(ref) : cells.length] = val;
      }
      rows.push(cells);
    }
    // Trim trailing fully-empty rows; skip empty sheets.
    while (rows.length && (!rows[rows.length - 1] || rows[rows.length - 1].every(c => !c))) rows.pop();
    if (rows.length) sheets.push({ name: names[s] || `Sheet ${s + 1}`, rows });
  }
  return sheets;
}
