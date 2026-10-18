import { Counter, AuditLog, Settings, DATA_MODELS, User } from '../models/index.js';
import { nowLocal, pad } from '../../../shared/dates.js';
import { defaultLists, resolveRoles } from '../../../shared/constants.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
/** Business-rule failure → 400 with the message shown to the user. */
export const fail = msg => { throw new HttpError(400, msg); };
export const notFound = what => { throw new HttpError(404, `${what} not found.`); };
export const forbidden = (msg = 'You do not have permission to do this.') => { throw new HttpError(403, msg); };

/* ---- Sequential human-readable IDs ---- */
const SEQ = { st: 'ST', bl: 'BL', rm: 'RM', bd: 'BD', br: 'BR', dp: 'DP', mem: 'NM-', reg: 'PR-', al: 'AL', du: 'DU', us: 'u', gv: 'GV-' };
const LEN = { st: 1, bl: 1, rm: 3, bd: 3, br: 3, dp: 2, mem: 4, reg: 4, al: 5, du: 5, us: 1, gv: 4 };
export async function nid(kind) {
  const c = await Counter.findByIdAndUpdate(kind, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return SEQ[kind] + pad(c.seq, LEN[kind]);
}
/** Re-sync every counter with the highest existing ID so a new record never reuses one. */
export async function syncCounters() {
  const map = { st: 'sites', bl: 'buildings', rm: 'rooms', bd: 'beds', br: 'branches', dp: 'depts', mem: 'members', reg: 'regs', al: 'allocs', du: 'duties', gv: 'visits' };
  const entries = Object.entries(map).map(([k, coll]) => [k, DATA_MODELS[coll]]).concat([['us', User]]);
  for (const [k, M] of entries) {
    const ids = await M.find({}, { _id: 1 }).lean();
    let mx = 0;
    ids.forEach(x => { const n = parseInt(String(x._id).slice(SEQ[k].length), 10); if (n > mx) mx = n; });
    await Counter.updateOne({ _id: k }, { $set: { seq: mx } }, { upsert: true });
  }
}

/* ---- Audit trail ---- */
export const who = user => user ? user.name : 'System';
export async function log(user, text) { await AuditLog.create({ at: nowLocal(), by: who(user), text }); }
/** Append a timeline entry to a registration document (saved by the caller). */
export function hist(user, reg, text, at) { reg.history.push({ at: at || nowLocal(), by: who(user), text }); }

/* ---- Settings (single document) ---- */
export async function getSettings() {
  let s = await Settings.findById('app');
  if (!s) s = await Settings.create({ _id: 'app', lists: defaultLists(), perms: null, tomb: {} });
  return s;
}
export async function getRoles() { const s = await getSettings(); return resolveRoles(s.perms); }

/* ---- Write lock ----
   Business rules such as "a bed is never double-booked" read and then write several
   collections. Running all writes one at a time keeps those checks race-free on a
   single server process (standalone MongoDB has no multi-document transactions). */
let chain = Promise.resolve();
/* Data revision: bumped after every successful write so browsers can poll GET /api/rev
   cheaply and reload the snapshot only when something changed. */
let rev = Date.now();
/* On Vercel several short-lived instances serve requests, so the revision is kept in the database
   and bumped before the response is sent (a serverless instance may be frozen right after it). */
const sharedRev = !!process.env.VERCEL;
export const getRev = async () => sharedRev ? ((await Counter.findById('rev').lean()) || { seq: 0 }).seq : rev;
export function serialWrites(req, res, next) {
  if (req.method === 'GET') return next();
  const counts = !['/auth/login', '/notifications/read'].includes(req.path);
  if (counts && sharedRev) {
    const json = res.json.bind(res);
    res.json = body => {
      if (res.statusCode >= 400) return json(body);
      Counter.updateOne({ _id: 'rev' }, { $inc: { seq: 1 } }, { upsert: true }).then(() => json(body), () => json(body));
      return res;
    };
  } else if (counts) res.on('finish', () => { if (res.statusCode < 400) rev++; });
  const run = chain.then(() => new Promise(resolve => {
    res.on('finish', resolve); res.on('close', resolve);
    next();
  }));
  chain = run.catch(() => {});
}

export const out = d => { if (!d) return d; const { _id, ...rest } = d; return { id: _id, ...rest }; };
