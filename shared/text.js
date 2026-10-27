/* Clean-up applied to names, places and free text before they are saved (server) and shown as a preview (client). */

const EMPTY = /^(null|undefined|nil|n\/?a|none|-+|\.+)$/i;
/** Trim, collapse repeated / unusual spaces; placeholder values such as "null" or "N/A" become empty. */
export const cleanText = s => { const t = String(s == null ? '' : s).replace(/[\s ​]+/g, ' ').trim(); return EMPTY.test(t) ? '' : t; };

/* first letter capital, rest small — short all-capital words (e.g. "DJJS", "J&K") are kept as typed */
const word = (w, keepCaps) => keepCaps && /^[A-Z0-9&.]{2,4}$/.test(w) ? w
  : w.toLowerCase().replace(/(^|[-'(/])([a-z])/g, (m, p, c) => p + c.toUpperCase());

/** "  sukhwinder   SINGH " → "Sukhwinder Singh"; "SukhwinderSingh" → "Sukhwinder Singh"; "dr.ram" → "Dr. Ram" */
export function personName(s) {
  let t = cleanText(s);
  if (!t) return '';
  t = t.replace(/([a-z])([A-Z])/g, '$1 $2')        // a missing space between two words
    .replace(/\s*\.\s*/g, '. ').replace(/\s*,\s*/g, ', ').trim().replace(/[.,]$/, m => m === '.' ? '.' : '');
  const allCaps = !/[a-z]/.test(t);                  // typed in capitals: treat every word as a normal word
  return t.split(' ').map((w, i) => i && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : word(w, !allCaps)).join(' ').replace(/\s+/g, ' ').trim();
}
/* joining words stay small inside a name: "Guru of …", "Singh da …" */
const SMALL = new Set(['of', 'and', 'the', 'da', 'de', 'di', 'van', 'von', 'bin', 'binti']);

/** District / city names: spaces cleaned and each word capitalised ("new  delhi" → "New Delhi"). */
export function placeName(s) {
  const t = cleanText(s);
  if (!t) return '';
  const allCaps = !/[a-z]/.test(t);
  return t.split(' ').map(w => word(w, !allCaps)).join(' ');
}

/** Natural order: "V2" before "V10", "Bed A" before "Bed B". */
const coll = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const natCmp = (a, b) => coll.compare(String(a == null ? '' : a), String(b == null ? '' : b));
export const natSortBy = (list, key) => list.slice().sort((a, b) => natCmp(key(a), key(b)));
