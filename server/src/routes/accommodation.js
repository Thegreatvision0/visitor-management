/* Accommodation structure: Site → Building → Floor → Room → Bed, plus bed cleaning. */
import { Router } from 'express';
import { Site, Building, Room, Bed, Allocation } from '../models/index.js';
import { need } from '../middleware/auth.js';
import { nid, log, fail, notFound } from '../lib/core.js';
import { body, check, oneOf } from '../lib/validate.js';
import { bedShort, memberName, holderName } from '../services/domain.js';
import { sameName } from '../../../shared/dates.js';
import { ROOM_GENDERS } from '../../../shared/constants.js';

const r = Router();
r.use(need('accommodation'));
const ok = res => res.json({ ok: true });
const get = async (M, id, what) => { const x = await M.findById(id); if (!x) notFound(what); return x; };
const parseFloors = t => [...new Set((Array.isArray(t) ? t : String(t).split(',')).map(x => String(x).trim()).filter(Boolean))];
async function nextLabels(roomId, n) {
  const used = new Set((await Bed.find({ roomId }).lean()).map(b => b.label.toLowerCase())), out = [];
  for (let i = 0; out.length < n && i < 500; i++) { const l = i < 26 ? String.fromCharCode(65 + i) : String(i + 1); if (!used.has(l.toLowerCase())) { out.push(l); used.add(l.toLowerCase()); } }
  return out;
}

/* ---------- beds: cleaning ---------- */
r.post('/beds/:id/clean', async (req, res) => {
  const b = await get(Bed, req.params.id, 'Bed'); b.cleaning = false; await b.save();
  await log(req.user, 'Bed cleaned: ' + await bedShort(b._id)); ok(res);
});
r.post('/beds/:id/dirty', async (req, res) => {
  const b = await get(Bed, req.params.id, 'Bed');
  if (b.cleaning || await Allocation.exists({ bedId: b._id, active: true })) fail('Only a free bed can be marked for cleaning.');
  b.cleaning = true; await b.save(); await log(req.user, 'Bed marked for cleaning: ' + await bedShort(b._id)); ok(res);
});

/* ---------- add ---------- */
r.post('/sites', async (req, res) => {
  const v = body(req, ['name']); check(v, [['name', 'Site name', 'req']]);
  if ((await Site.find().lean()).some(x => sameName(x.name, v.name))) fail('A site with this name already exists.');
  const s = await Site.create({ _id: await nid('st'), name: v.name }); await log(req.user, 'Added site ' + v.name); res.json({ id: s._id });
});
r.post('/buildings', async (req, res) => {
  const v = body(req, ['siteId', 'name', 'floors']); check(v, [['siteId', 'Site', 'req'], ['name', 'Building name', 'req'], ['floors', 'Floors', 'req']]);
  await get(Site, v.siteId, 'Site');
  if ((await Building.find({ siteId: v.siteId }).lean()).some(x => sameName(x.name, v.name))) fail('This site already has a building with that name.');
  const fl = parseFloors(v.floors); if (!fl.length) fail('Enter at least one floor.');
  const b = await Building.create({ _id: await nid('bl'), siteId: v.siteId, name: v.name, floors: fl }); await log(req.user, 'Added building ' + v.name); res.json({ id: b._id });
});
r.post('/buildings/:id/floors', async (req, res) => {
  const bl = await get(Building, req.params.id, 'Building'), v = body(req, ['name']); check(v, [['name', 'Floor name', 'req']]);
  if (bl.floors.some(f => sameName(f, v.name))) fail('This floor already exists in the building.');
  bl.floors.push(v.name); await bl.save(); await log(req.user, `Added ${v.name} floor to ${bl.name}`); ok(res);
});
r.post('/rooms', async (req, res) => {
  const v = body(req, ['bid', 'floor', 'name', 'gender', 'count']);
  check(v, [['bid', 'Building', 'req'], ['floor', 'Floor', 'req'], ['name', 'Room name / number', 'req'], ['gender', 'Intended for', 'req']]);
  oneOf(v.gender, ROOM_GENDERS, 'gender');
  const bl = await get(Building, v.bid, 'Building'); if (!bl.floors.includes(v.floor)) fail('Select a floor of this building.');
  const n = Number(v.count); if (!(Number.isInteger(n) && n >= 0 && n <= 30)) fail('Beds must be between 0 and 30.');
  if ((await Room.find({ buildingId: v.bid }).lean()).some(x => sameName(x.name, v.name))) fail('A room with this name already exists in this building.');
  const rid = await nid('rm'); await Room.create({ _id: rid, buildingId: v.bid, floor: v.floor, name: v.name, gender: v.gender });
  for (const l of await nextLabels(rid, n)) await Bed.create({ _id: await nid('bd'), roomId: rid, label: l, cleaning: false });
  await log(req.user, `Added room ${v.name} with ${n} bed(s)`); res.json({ id: rid });
});
r.post('/rooms/:id/beds', async (req, res) => {
  const rm = await get(Room, req.params.id, 'Room'), v = body(req, ['count', 'label']);
  const n = Number(v.count); if (!(Number.isInteger(n) && n >= 1 && n <= 30)) fail('Add between 1 and 30 beds.');
  let labels;
  if (n === 1 && v.label) { if (await Bed.exists({ roomId: rm._id, label: new RegExp('^' + v.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') })) fail('This bed label already exists in the room.'); labels = [v.label]; }
  else labels = await nextLabels(rm._id, n);
  for (const l of labels) await Bed.create({ _id: await nid('bd'), roomId: rm._id, label: l, cleaning: false });
  await log(req.user, `Added ${n} bed(s) to ${rm.name}`); ok(res);
});

/* ---------- edit ---------- */
r.put('/sites/:id', async (req, res) => {
  const s = await get(Site, req.params.id, 'Site'), v = body(req, ['name']); check(v, [['name', 'Site name', 'req']]);
  if ((await Site.find({ _id: { $ne: s._id } }).lean()).some(x => sameName(x.name, v.name))) fail('A site with this name already exists.');
  await log(req.user, `Renamed site ${s.name} → ${v.name}`); s.name = v.name; await s.save(); ok(res);
});
r.put('/buildings/:id', async (req, res) => {
  const bl = await get(Building, req.params.id, 'Building'), v = body(req, ['name', 'siteId']); check(v, [['name', 'Building name', 'req'], ['siteId', 'Site', 'req']]);
  await get(Site, v.siteId, 'Site');
  if ((await Building.find({ _id: { $ne: bl._id }, siteId: v.siteId }).lean()).some(x => sameName(x.name, v.name))) fail('That site already has a building with this name.');
  await log(req.user, `Edited building ${bl.name} → ${v.name}`); bl.name = v.name; bl.siteId = v.siteId; await bl.save(); ok(res);
});
r.put('/buildings/:id/floors', async (req, res) => {
  const bl = await get(Building, req.params.id, 'Building'), v = body(req, ['old', 'name']); check(v, [['name', 'Floor name', 'req']]);
  if (!bl.floors.includes(v.old)) notFound('Floor');
  if (!sameName(v.name, v.old) && bl.floors.some(f => sameName(f, v.name))) fail('This floor already exists in the building.');
  bl.floors = bl.floors.map(f => f === v.old ? v.name : f); await bl.save();
  await Room.updateMany({ buildingId: bl._id, floor: v.old }, { floor: v.name });
  await log(req.user, `Renamed floor ${v.old} → ${v.name} (${bl.name})`); ok(res);
});
r.put('/rooms/:id', async (req, res) => {
  const rm = await get(Room, req.params.id, 'Room'), v = body(req, ['name', 'floor', 'gender']);
  check(v, [['name', 'Room name / number', 'req'], ['floor', 'Floor', 'req'], ['gender', 'Intended for', 'req']]); oneOf(v.gender, ROOM_GENDERS, 'gender');
  const bl = await get(Building, rm.buildingId, 'Building'); if (!bl.floors.includes(v.floor)) fail('Select a floor of this building.');
  if ((await Room.find({ _id: { $ne: rm._id }, buildingId: rm.buildingId }).lean()).some(x => sameName(x.name, v.name))) fail('Another room in this building already has this name.');
  await log(req.user, `Edited room ${rm.name} → ${v.name}`); Object.assign(rm, v); await rm.save(); ok(res);
});
r.put('/beds/:id', async (req, res) => {
  const bd = await get(Bed, req.params.id, 'Bed'), v = body(req, ['label']); check(v, [['label', 'Bed label', 'req']]);
  if ((await Bed.find({ _id: { $ne: bd._id }, roomId: bd.roomId }).lean()).some(x => sameName(x.label, v.label))) fail('This bed label already exists in the room.');
  await log(req.user, `Renamed bed ${bd.label} → ${v.label}`); bd.label = v.label; await bd.save(); ok(res);
});

/* ---------- delete (any level; blocked while a bed in it is occupied or reserved) ---------- */
async function plan(kind, id, floor) {
  let roomIds = [], label = '', apply = async () => {};
  if (kind === 'site') {
    const s = await get(Site, id, 'Site'), bls = await Building.find({ siteId: id }).lean();
    roomIds = (await Room.find({ buildingId: { $in: bls.map(b => b._id) } }).lean()).map(x => x._id);
    label = `${s.name} (${bls.length} building(s))`;
    apply = async () => { await Building.deleteMany({ siteId: id }); await Site.deleteOne({ _id: id }); };
  } else if (kind === 'building') {
    const bl = await get(Building, id, 'Building');
    roomIds = (await Room.find({ buildingId: id }).lean()).map(x => x._id); label = `${bl.name} (${bl.floors.length} floor(s))`;
    apply = async () => { await Building.deleteOne({ _id: id }); };
  } else if (kind === 'floor') {
    const bl = await get(Building, id, 'Building'); if (!bl.floors.includes(floor)) notFound('Floor');
    roomIds = (await Room.find({ buildingId: id, floor }).lean()).map(x => x._id); label = `${floor} floor of ${bl.name}`;
    apply = async () => { await Building.updateOne({ _id: id }, { $pull: { floors: floor } }); };
  } else if (kind === 'room') {
    const rm = await get(Room, id, 'Room'); roomIds = [id]; label = rm.name;
  } else if (kind === 'bed') {
    const bd = await get(Bed, id, 'Bed'), rm = await Room.findById(bd.roomId).lean();
    return { label: `bed ${bd.label} in ${rm ? rm.name : '?'}`, roomIds: [], bedIds: [id], apply };
  } else fail('Unknown item.');
  const bedIds = (await Bed.find({ roomId: { $in: roomIds } }, { _id: 1 }).lean()).map(x => x._id);
  return { label, roomIds, bedIds, apply };
}
r.delete('/:kind/:id', async (req, res) => {
  const kinds = { sites: 'site', buildings: 'building', floors: 'floor', rooms: 'room', beds: 'bed' }, kind = kinds[req.params.kind];
  if (!kind) fail('Unknown item.');
  const p = await plan(kind, req.params.id, String(req.query.floor || ''));
  const live = await Allocation.find({ active: true, bedId: { $in: p.bedIds } }).lean();
  if (live.length) fail(`${live.length} bed(s) in this ${kind} are occupied or reserved — for example ${await holderName(live[0])} in ${await bedShort(live[0].bedId)}. Transfer or release those members first (Accommodation → Resident register), then delete.`);
  /* past stays keep the bed's name in their history */
  for (const bid of p.bedIds) { const txt = await bedShort(bid); await Allocation.updateMany({ bedId: bid }, { bedPath: txt }); }
  await Bed.deleteMany({ _id: { $in: p.bedIds } }); await Room.deleteMany({ _id: { $in: p.roomIds } }); await p.apply();
  await log(req.user, `Deleted ${kind} ${p.label}`); ok(res);
});

export default r;
