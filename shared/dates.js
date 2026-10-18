/* Date helpers shared by server and client.
   Dates are stored as local 'YYYY-MM-DD' strings and date-times as 'YYYY-MM-DDTHH:MM',
   so plain string comparison orders them correctly. */
export const pad = (n, l = 2) => String(n).padStart(l, '0');
export const fmtD = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const today = () => fmtD(new Date());
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return fmtD(d); };
export const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fd = s => { if (!s) return '—'; const p = s.slice(0, 10).split('-'); return p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0]; };
export const fdt = s => !s ? '—' : fd(s) + (s.length > 10 ? ', ' + s.slice(11, 16) : '');
export const nowLocal = () => { const d = new Date(); return fmtD(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const overlaps = (a1, a2, b1, b2) => a1 <= b2 && b1 <= a2;
export const ageOf = dob => {
  if (!dob) return '';
  const b = new Date(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
};
export const dayOf = s => s ? s.slice(0, 10) : '';
export const ucase = s => s.charAt(0).toUpperCase() + s.slice(1);
/** 'Today, 10:30' / 'Yesterday, 14:00' / '12 Oct 2026, 09:15' for a date or date-time string. */
export const relTime = s => {
  if (!s) return '—';
  const d = s.slice(0, 10), t = s.length > 10 ? ', ' + s.slice(11, 16) : '';
  if (d === today()) return 'Today' + t;
  if (d === addDays(today(), -1)) return 'Yesterday' + t;
  return fd(d) + t;
};
export const sameName =(a, b) => String(a).toLowerCase() === String(b).toLowerCase();
