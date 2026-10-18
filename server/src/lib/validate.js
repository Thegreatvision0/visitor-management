import { fail } from './core.js';
import { isMobile } from '../../../shared/constants.js';

/** Pick and trim the listed string fields from a request body. */
export function body(req, keys) {
  const b = req.body || {}, v = {};
  keys.forEach(k => { const x = b[k]; v[k] = x == null ? '' : typeof x === 'string' ? x.trim() : x; });
  return v;
}
/** Field rules: [key, label, flags] where flags may contain 'req' and/or 'tel'. Fails with the form's wording. */
export function check(v, rules) {
  for (const [k, label, flags = ''] of rules) {
    if (flags.includes('req') && !v[k]) fail(`${label} is required.`);
    if (v[k] && flags.includes('tel') && !isMobile(v[k])) fail(`${label} must be a valid 10-digit mobile number.`);
  }
}
export const oneOf = (v, list, label) => { if (v && !list.includes(v)) fail(`Choose a valid ${label}.`); };
const DATE = /^\d{4}-\d{2}-\d{2}$/, DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const isDate = (v, label) => { if (v && !DATE.test(v)) fail(`${label} must be a date.`); };
export const isDateTime = (v, label) => { if (v && !DT.test(v)) fail(`${label} must be a date and time.`); };
