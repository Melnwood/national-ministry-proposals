// Extract the plain text of a .docx entirely in the browser. A .docx is a zip
// archive; we find word/document.xml via the zip's central directory, inflate
// it with the native DecompressionStream, and strip the XML down to paragraph
// text. No libraries, no server round-trip.

const decodeEntities = s => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export async function docxToText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  // End-of-central-directory record (signature 0x06054b50), scanned from the end.
  let eocd = -1;
  const stop = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= stop; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That does not look like a .docx file.');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  let entry = null;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const cmtLen = dv.getUint16(off + 32, true);
    const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));
    if (name === 'word/document.xml') {
      entry = { method: dv.getUint16(off + 10, true), csize: dv.getUint32(off + 20, true), lho: dv.getUint32(off + 42, true) };
      break;
    }
    off += 46 + nameLen + extraLen + cmtLen;
  }
  if (!entry) throw new Error('No document text found in that file.');
  const lnameLen = dv.getUint16(entry.lho + 26, true);
  const lextraLen = dv.getUint16(entry.lho + 28, true);
  const start = entry.lho + 30 + lnameLen + lextraLen;
  const comp = buf.subarray(start, start + entry.csize);
  let xmlBytes;
  if (entry.method === 0) {
    xmlBytes = comp;
  } else {
    const stream = new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const xml = new TextDecoder().decode(xmlBytes);
  return xml.split('</w:p>')
    .map(p => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''))
    .map(decodeEntities)
    .map(s => s.trim())
    .filter(Boolean)
    .join('\n');
}
