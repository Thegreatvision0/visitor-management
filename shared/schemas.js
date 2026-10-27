/* Input rules (Zod), used by the browser forms and again by the server before saving.
   Besides format checks they refuse placeholder / keyboard text such as "dfdf", "asdf", "test", "aaaa". */
import { z } from 'zod';
import { GENDERS, TYPES } from './constants.js';

const JUNK_WORDS = new Set(['test', 'testing', 'tester', 'dummy', 'demo', 'sample', 'asdf', 'asd', 'qwerty', 'qwe', 'zxcv', 'abc', 'abcd', 'xyz', 'xxx', 'na', 'nil', 'none', 'null', 'undefined', 'hello', 'hi']);
/** True for text that is clearly not real: no vowels in Latin text, a 1–3 letter pattern repeated ("dfdf", "aaaa"), keyboard runs or test words. */
export function looksJunk(s) {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return false;
  const letters = t.replace(/[^a-z]/g, '');
  if (JUNK_WORDS.has(t) || t.split(/\s+/).every(w => JUNK_WORDS.has(w.replace(/[^a-z]/g, '')))) return true;
  if (letters.length >= 3 && !/[^a-z\s.'-]/.test(t.replace(/[0-9,/()&#:]/g, '')) && !/[aeiouy]/.test(letters)) return true; // Latin text without a single vowel
  if (/^(.{1,3})\1{1,}$/.test(t.replace(/\s+/g, ''))) return true;                                                     // dfdf, asdasd, aaaa, 1111
  if (/(qwert|asdfg|zxcvb|sdfgh|dfghj|fghjk|ghjkl|hjkl|wertyu)/.test(letters)) return true;                            // keyboard runs
  return false;
}
const real = what => s => !looksJunk(s) || `${what} looks like test or placeholder text — please enter the real value.`;
const refineReal = (schema, what) => schema.superRefine((s, ctx) => { const r = real(what)(s); if (r !== true) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r }); });

const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u; // any script (Latin, Devanagari, Gurmukhi …), spaces, . ' -
const personName = what => refineReal(z.string().trim().min(2, `${what} must have at least 2 letters.`).max(80, `${what} is too long.`).regex(NAME, `${what} may contain only letters, spaces and . ' -`), what);
const place = what => refineReal(z.string().trim().min(2, `${what} is required.`).max(80, `${what} is too long.`), what);
const text = (what, min, max) => refineReal(z.string().trim().min(min, `${what} must have at least ${min} characters.`).max(max, `${what} is too long (max ${max}).`), what);
const mobile = what => z.string().trim().regex(/^[6-9]\d{9}$/, `${what} must be a valid 10-digit mobile number.`);
const date = what => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${what} is required.`);
const req = what => z.string().trim().min(1, `${what} is required.`);

export const memberSchema = z.object({
  name: personName('Full name'), mobile: mobile('Mobile number'), dob: date('Date of birth'),
  gender: z.enum(GENDERS, { errorMap: () => ({ message: 'Choose a gender.' }) }), type: z.enum(TYPES, { errorMap: () => ({ message: 'Choose a member type.' }) }),
  state: req('State'), branchId: req('Branch'), district: place('District'), address: text('Address', 5, 300),
  emName: personName('Emergency contact name'), emPhone: mobile('Emergency contact mobile'), emRel: z.string().optional()
}).passthrough().superRefine((v, ctx) => {
  const age = (Date.now() - new Date(v.dob + 'T00:00:00')) / 31557600000;
  if (age < 0) ctx.addIssue({ code: 'custom', path: ['dob'], message: 'Date of birth cannot be in the future.' });
  else if (age > 110) ctx.addIssue({ code: 'custom', path: ['dob'], message: 'Check the date of birth (more than 110 years ago).' });
  if (v.emPhone && v.emPhone === v.mobile) ctx.addIssue({ code: 'custom', path: ['emPhone'], message: 'The emergency contact mobile must be someone else’s number.' });
});

export const branchSchema = z.object({
  name: text('Branch name', 2, 80), state: req('State'), district: place('District'), coordinator: personName('Coordinator name'), phone: mobile('Coordinator mobile'),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]).optional()
}).passthrough();

export const regSchema = z.object({
  memberId: req('Member'), branchId: req('Registering branch'), arrival: date('Arrival date'), departure: date('Expected departure date'), purpose: text('Purpose of visit', 3, 300)
}).passthrough().superRefine((v, ctx) => { if (v.departure < v.arrival) ctx.addIssue({ code: 'custom', path: ['departure'], message: 'Departure date cannot be before arrival.' }); });

/** First problem as { field, message }, or null when valid. */
export function firstIssue(schema, values) {
  const r = schema.safeParse(values);
  if (r.success) return null;
  const i = r.error.issues[0];
  return { field: String(i.path[0] || ''), message: i.message };
}
