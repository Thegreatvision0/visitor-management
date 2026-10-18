/* Load the official DJJS branch list (server/src/data/djjs-branches.json, taken from https://www.djjs.org/contact).
   Matching is by branch name (case-insensitive): an existing branch is updated in place — so its members,
   visits and coordinator users stay linked — and a missing one is created. Safe to run again. */
import fs from 'node:fs';
import { Branch, Settings } from '../models/index.js';
import { nid, log, getSettings } from '../lib/core.js';

const FILE = new URL('../data/djjs-branches.json', import.meta.url);
const norm = s => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

export function officialBranchList() { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }

export async function importDjjsBranches(user) {
  const { branches, source, fetched } = officialBranchList();
  const existing = await Branch.find();
  const byName = new Map(existing.map(b => [norm(b.name), b]));
  let created = 0, updated = 0;
  /* main branches first, so sub-branches can find their parent */
  for (const e of [...branches].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0))) {
    const parent = e.parent ? byName.get(norm(e.parent)) : null;
    const fields = { name: e.name, state: e.state, district: e.district, coordinator: e.coordinator, phone: e.phone, phones: e.phones, email: e.email, address: e.address, parentId: parent ? parent._id : '', sample: false };
    let b = byName.get(norm(e.name));
    if (b) { Object.assign(b, fields); updated++; }
    else { b = new Branch({ _id: await nid('br'), ...fields }); created++; }
    await b.save();
    byName.set(norm(e.name), b);
  }
  /* every state used by a branch must be selectable */
  const s = await getSettings(), states = s.lists.states.slice();
  const missing = [...new Set(branches.map(b => b.state))].filter(x => !states.includes(x));
  if (missing.length) await Settings.updateOne({ _id: 'app' }, { $push: { 'lists.states': { $each: missing } } });
  const left = (await Branch.find({ sample: true }, { name: 1 }).lean()).map(b => b.name);
  await log(user, `Loaded official DJJS branch list: ${created} added, ${updated} updated`);
  return { total: branches.length, created, updated, sampleLeft: left, source, fetched };
}
