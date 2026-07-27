// Extract the plain text of a .docx entirely in the browser — a docx is a
// zip; word/document.xml holds the text. Uses the shared zip helpers.

import { zipEntries, zipRead, decodeEntities } from './zip.js';

export async function docxToText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = zipEntries(buf);
  const entry = entries['word/document.xml'];
  if (!entry) throw new Error('No document text found in that file.');
  const xml = new TextDecoder().decode(await zipRead(buf, entry));
  return xml.split('</w:p>')
    .map(p => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''))
    .map(decodeEntities)
    .map(s => s.trim())
    .filter(Boolean)
    .join('\n');
}
