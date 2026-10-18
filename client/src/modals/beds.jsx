/* Accommodation dialogs: assign / transfer / extend / release beds, bed detail, and structure editing. */
import { useState } from 'react';
import { useApp } from '../context.jsx';
import { FormModal, Modal, CloseBtn, Info, confirm } from '../components/Modal.jsx';
import { Badge, Table } from '../components/ui.jsx';
import { fd, today, dayOf, ucase } from '@shared/dates.js';
import { ROOM_GENDERS, stayStart, stayEnd } from '@shared/constants.js';

/** Assign / transfer a bed with Site → Building → Floor → Room → Bed cascade (only free beds are offered). */
function BedModal({ regId, presetBed, mode }) {
  const { D, data, api, mutate } = useApp();
  const r = D.reg(regId), m = D.member(r.memberId) || { name: '?', gender: '' }, cur = D.activeAlloc(regId), transfer = mode === 'transfer';
  const t = today();
  const from0 = transfer ? (t < cur.from ? cur.from : t > cur.to ? cur.to : t) : (() => { const s = stayStart(r), a = r.actualIn ? dayOf(r.actualIn) : s; return a < s ? a : s; })();
  const values = { from: from0, to: transfer ? cur.to : stayEnd(r) };
  if (presetBed) { const b = D.bedO(presetBed), rm = D.room(b.roomId), bl = D.bldg(rm.buildingId); Object.assign(values, { site: bl.siteId, bld: bl.id, floor: rm.floor, room: rm.id, bed: b.id }); }
  const free = (b, v) => !b.cleaning && !D.conflicts(b.id, v.from, v.to, transfer ? cur.id : null).length;
  const rmOf = b => D.room(b.roomId) || {}, cnt = (v, f) => data.beds.filter(b => free(b, v) && f(b)).length;
  const fields = [
    { n: 'from', l: transfer ? 'Move on' : 'Bed from', t: 'date', req: 1 }, { n: 'to', l: 'Bed until', t: 'date', req: 1, ro: transfer },
    { n: 'site', l: 'Site', t: 'select', ph: 'Select site', req: 1, opts: v => data.sites.map(s => ({ v: s.id, l: `${s.name} (${cnt(v, b => (D.bldg(rmOf(b).buildingId) || {}).siteId === s.id)} free)` })) },
    { n: 'bld', l: 'Building', t: 'select', ph: 'Select building', req: 1, opts: v => data.buildings.filter(b => b.siteId === v.site).map(b => ({ v: b.id, l: `${b.name} (${cnt(v, x => rmOf(x).buildingId === b.id)} free)` })) },
    { n: 'floor', l: 'Floor', t: 'select', ph: 'Select floor', req: 1, opts: v => { const b = D.bldg(v.bld); return b ? b.floors.map(f => ({ v: f, l: `${f} Floor (${cnt(v, x => rmOf(x).buildingId === b.id && rmOf(x).floor === f)} free)` })) : []; } },
    { n: 'room', l: 'Room', t: 'select', ph: 'Select room', req: 1, opts: v => data.rooms.filter(x => x.buildingId === v.bld && x.floor === v.floor).map(x => ({ v: x.id, l: `${x.name} · ${x.gender} (${cnt(v, b => b.roomId === x.id)} free)` })) },
    { n: 'bed', l: 'Bed (free for these dates)', t: 'select', ph: 'Select bed', req: 1, full: 1, opts: v => data.beds.filter(b => b.roomId === v.room && free(b, v)).map(b => ({ v: b.id, l: 'Bed ' + b.label })),
      hint: v => { const rm = D.room(v.room); return rm && rm.gender !== 'Any' && rm.gender !== m.gender ? `⚠ This room is marked ${rm.gender}; member is ${m.gender}.` : ''; } }];
  const reset = { site: { bld: '', floor: '', room: '', bed: '' }, bld: { floor: '', room: '', bed: '' }, floor: { room: '', bed: '' }, room: { bed: '' } };
  return <FormModal title={`${transfer ? 'Transfer' : 'Assign'} bed — ${m.name}`} wide values={values} fields={fields} onChange={n => reset[n]}
    pre={<div className="note">{m.name} ({m.gender}) · approved stay {fd(stayStart(r))} – {fd(stayEnd(r))}{transfer ? <><br />Current bed: {D.bedPath(D.bedO(cur.bedId))} — the old allocation stays in history.</> : null}</div>}
    buttons={[{
      label: transfer ? 'Transfer' : 'Assign bed', run: v => transfer
        ? mutate(() => api.post(`/regs/${regId}/bed/transfer`, { bedId: v.bed, date: v.from }), 'Bed transferred; old bed marked for cleaning')
        : mutate(() => api.post(`/regs/${regId}/bed`, { bedId: v.bed, from: v.from, to: v.to }), 'Bed assigned')
    }]} />;
}
export const bedAssign = (app, regId, presetBed) => app.openModal(<BedModal regId={regId} presetBed={presetBed} mode="assign" />);
export const bedTransfer = (app, regId) => app.openModal(<BedModal regId={regId} mode="transfer" />);

export function bedExtend(app, regId) {
  const { D, api, mutate } = app, r = D.reg(regId);
  app.openModal(<FormModal title={`Extend stay — ${D.mName(r.memberId)}`} pre={<div className="note">Current end date: <b>{fd(stayEnd(r))}</b>. The bed allocation and active duty are extended too, if the bed is free.</div>}
    fields={[{ n: 'to', l: 'New end date', t: 'date', req: 1 }, { n: 'note', l: 'Reason', req: 1 }]} buttons={[{ label: 'Extend', run: v => mutate(() => api.post(`/regs/${regId}/extend`, v), 'Stay extended') }]} />);
}
export function bedRelease(app, regId) {
  const { D } = app, r = D.reg(regId), a = D.activeAlloc(regId);
  if (!a) return app.toast('This member has no bed assigned.', 'bad');
  const inn = r.status === 'Checked In';
  confirm(app, inn ? 'Unassign bed' : 'Release reservation',
    inn ? <>Take <b>{D.mName(r.memberId)}</b> out of <b>{D.bedShort(D.bedO(a.bedId))}</b>? They stay checked in but without a bed — assign another bed afterwards. If the bed was actually used, mark it for cleaning from the bed board.</>
      : 'Release this bed reservation? The member stays approved and will be waiting for a bed.',
    inn ? 'Unassign' : 'Release', () => app.run(() => app.api.post(`/regs/${regId}/bed/release`), inn ? 'Bed unassigned' : 'Reservation released'));
}
export const bedClean = (app, id) => app.run(() => app.api.post(`/accommodation/beds/${id}/clean`), 'Bed is available again', { close: true });
export const bedDirty = (app, id) => app.run(() => app.api.post(`/accommodation/beds/${id}/dirty`), 'Bed marked for cleaning', { close: true });

function BedDetail({ id }) {
  const app = useApp(), { D, data } = app, b = D.bedO(id);
  const [pick, setPick] = useState('');
  if (!b) return <Info title="Bed">This bed no longer exists.</Info>;
  const s = D.bedStates().get(id), ed = D.canEdit('accommodation');
  const hs = data.allocs.filter(a => a.bedId === id).sort((x, y) => y.from.localeCompare(x.from)).slice(0, 6);
  const waiting = D.regs().filter(r => ['Approved', 'Checked In'].includes(r.status) && !D.activeAlloc(r.id));
  return <Modal title={<>Bed {b.label} <Badge s={s.status} /></>} footer={<CloseBtn />}>
    <p className="muted">{D.bedPath(b)}</p>
    {s.member ? <div className="note"><b>{s.member.name}</b> ({s.member.id}) · {fd(s.alloc.from)} – {fd(s.alloc.to)}</div> : null}
    {s.guest ? <div className="note">Reserved for guest <b>{s.guest}</b> ({s.alloc.regId}) · nights {fd(s.alloc.from)} – {fd(s.alloc.to)}. Managed from Guest Visits.</div> : null}
    {ed ? <div className="acts" style={{ margin: '12px 0' }}>
      {s.status === 'Cleaning' ? <button className="btn ok" onClick={() => bedClean(app, id)}>Mark cleaned</button> : null}
      {s.status === 'Available' ? (waiting.length ? <>
        <select className="in" value={pick} onChange={e => setPick(e.target.value)}><option value="">Assign to…</option>{waiting.map(r => <option key={r.id} value={r.id}>{D.mName(r.memberId) + ' (' + fd(stayStart(r)) + ' – ' + fd(stayEnd(r)) + ')'}</option>)}</select>
        <button className="btn pri" onClick={() => pick ? bedAssign(app, pick, id) : app.toast('Choose a member first')}>Assign</button>
      </> : <span className="muted">No approved member is waiting for a bed.</span>) : null}
      {s.reg && s.status === 'Occupied' ? <><button className="btn" onClick={() => bedTransfer(app, s.reg.id)}>Transfer</button><button className="btn" onClick={() => bedExtend(app, s.reg.id)}>Extend stay</button></> : null}
      {s.reg && ['Reserved', 'Occupied'].includes(s.status) ? <button className="btn" onClick={() => bedRelease(app, s.reg.id)}>{s.status === 'Reserved' ? 'Release reservation' : 'Unassign bed'}</button> : null}
      {s.status === 'Available' ? <button className="btn" onClick={() => bedDirty(app, id)}>Mark for cleaning</button> : null}
      <button className="btn" onClick={() => structEdit(app, 'bed', id)}>Rename bed</button><button className="btn dng" onClick={() => structDelete(app, 'bed', id)}>Delete bed</button>
    </div> : null}
    <h3>Recent history</h3>
    <Table cols={[['Member', a => a.guestName ? 'Guest: ' + a.guestName : D.mName(a.memberId)], ['From', a => fd(a.from)], ['To', a => fd(a.to)], ['Note', a => a.active ? 'Current' : a.endReason || 'Closed']]} rows={hs} empty="Never allocated." />
  </Modal>;
}
export const bedOpen = (app, id) => app.openModal(<BedDetail id={id} />);

/* ---------- structure: add / rename / delete at every level ---------- */
const nextLabels = (data, rid, n) => {
  const used = new Set(data.beds.filter(b => b.roomId === rid).map(b => b.label.toLowerCase())), out = [];
  for (let i = 0; out.length < n && i < 500; i++) { const l = i < 26 ? String.fromCharCode(65 + i) : String(i + 1); if (!used.has(l.toLowerCase())) { out.push(l); used.add(l.toLowerCase()); } }
  return out;
};
const A = '/accommodation';

export function structAdd(app, kind, a, b) {
  const { D, data, api, mutate, toast } = app;
  /* a child can only be added once its parent exists — send the user to the missing parent first */
  const need = { building: ['site', data.sites.length, 'Add a site first — a building belongs to a site.'], floor: ['building', data.buildings.length, 'Add a building first — a floor belongs to a building.'], room: ['building', data.buildings.length, 'Add a building first — a room belongs to a building.'], bed: ['room', data.rooms.length, 'Add a room first — a bed belongs to a room.'] }[kind];
  if (need && !need[1]) { toast(need[2]); return structAdd(app, need[0], ''); }
  const bldOpts = data.buildings.map(x => ({ v: x.id, l: `${(D.site(x.siteId) || {}).name} › ${x.name}` }));
  const open = (title, fields, values, label, run, onChange) => app.openModal(<FormModal title={title} fields={fields} values={values} onChange={onChange} buttons={[{ label, run }]} />);
  if (kind === 'site') return open('Add site', [{ n: 'name', l: 'Site name', req: 1, ph: 'e.g. Main Campus' }], {}, 'Add site', v => mutate(() => api.post(A + '/sites', v), 'Site added'));
  if (kind === 'building') return open('Add building', [{ n: 'siteId', l: 'Site', t: 'select', opts: data.sites.map(x => ({ v: x.id, l: x.name })), req: 1, ph: 'Select site' }, { n: 'name', l: 'Building name', req: 1, ph: 'e.g. Mangal Bhawan' }, { n: 'floors', l: 'Floors (comma-separated)', req: 1, full: 1, ph: 'Ground, First, Second', hint: 'You can add, rename or delete floors later.' }],
    { siteId: a || '', floors: 'Ground' }, 'Add building', v => mutate(() => api.post(A + '/buildings', v), 'Building added'));
  if (kind === 'floor') return open('Add floor', [{ n: 'bid', l: 'Building', t: 'select', opts: bldOpts, req: 1, ph: 'Select building' }, { n: 'name', l: 'Floor name', req: 1, ph: 'e.g. Third' }],
    { bid: a || '' }, 'Add floor', v => mutate(() => api.post(`${A}/buildings/${v.bid}/floors`, { name: v.name }), 'Floor added'));
  if (kind === 'room') return open('Add room', [{ n: 'bid', l: 'Building', t: 'select', opts: bldOpts, req: 1, ph: 'Select building' }, { n: 'floor', l: 'Floor', t: 'select', opts: v => (D.bldg(v.bid) || { floors: [] }).floors, req: 1, ph: 'Select floor' }, { n: 'name', l: 'Room name / number', req: 1, ph: 'e.g. M105' }, { n: 'gender', l: 'Intended for', t: 'select', opts: ROOM_GENDERS, req: 1 }, { n: 'count', l: 'Number of beds to create', t: 'number', req: 1, hint: '0 is fine — you can add beds one by one later.' }],
    { bid: a || '', floor: b || '', gender: 'Any', count: '4' }, 'Add room', v => mutate(() => api.post(A + '/rooms', v), 'Room added'), n => n === 'bid' ? { floor: '' } : null);
  if (kind === 'bed') {
    const rm = D.room(a);
    return open(`Add bed${rm ? ' to ' + rm.name : ''}`, [{ n: 'rid', l: 'Room', t: 'select', opts: data.rooms.map(r => ({ v: r.id, l: `${(D.bldg(r.buildingId) || {}).name} · ${r.floor} · ${r.name}` })), req: 1, ph: 'Select room' }, { n: 'count', l: 'How many beds', t: 'number', req: 1 }, { n: 'label', l: 'Bed label (used when adding one bed)', hint: 'Keep the suggestion or type your own, e.g. A, B, 1, Upper.' }],
      { rid: a || '', count: '1', label: rm ? nextLabels(data, a, 1)[0] : '' }, 'Add', v => mutate(() => api.post(`${A}/rooms/${v.rid}/beds`, { count: v.count, label: v.label }), `${v.count} bed(s) added`),
      (n, v) => n === 'rid' ? { label: nextLabels(data, v, 1)[0] || '' } : null);
  }
}

export function structEdit(app, kind, a, b) {
  const { D, data, api, mutate } = app;
  const open = (title, fields, values, run) => app.openModal(<FormModal title={title} fields={fields} values={values} buttons={[{ label: 'Save', run }]} />);
  if (kind === 'site') return open('Rename site', [{ n: 'name', l: 'Site name', req: 1 }], { name: D.site(a).name }, v => mutate(() => api.put(`${A}/sites/${a}`, v), 'Site updated'));
  if (kind === 'building') { const bl = D.bldg(a); return open(`Edit building — ${bl.name}`, [{ n: 'name', l: 'Building name', req: 1 }, { n: 'siteId', l: 'Site', t: 'select', opts: data.sites.map(x => ({ v: x.id, l: x.name })), req: 1, ph: 'Select site' }], { name: bl.name, siteId: bl.siteId }, v => mutate(() => api.put(`${A}/buildings/${a}`, v), 'Building updated')); }
  if (kind === 'floor') return open(`Rename floor — ${D.bldg(a).name}`, [{ n: 'name', l: 'Floor name', req: 1 }], { name: b }, v => mutate(() => api.put(`${A}/buildings/${a}/floors`, { old: b, name: v.name }), 'Floor renamed'));
  if (kind === 'room') { const rm = D.room(a), bl = D.bldg(rm.buildingId); return open(`Edit room — ${rm.name}`, [{ n: 'name', l: 'Room name / number', req: 1 }, { n: 'floor', l: 'Floor', t: 'select', opts: bl.floors, req: 1, ph: 'Select floor' }, { n: 'gender', l: 'Intended for', t: 'select', opts: ROOM_GENDERS, req: 1 }], { name: rm.name, floor: rm.floor, gender: rm.gender }, v => mutate(() => api.put(`${A}/rooms/${a}`, v), 'Room updated')); }
  if (kind === 'bed') { const bd = D.bedO(a); return open(`Rename bed — ${bd.label}`, [{ n: 'label', l: 'Bed label', req: 1 }], { label: bd.label }, v => mutate(() => api.put(`${A}/beds/${a}`, v), 'Bed renamed')); }
}

/** What would be removed if this node were deleted. */
function structPlan(D, data, kind, a, b) {
  let roomIds = [], label = '';
  if (kind === 'site') { const bls = data.buildings.filter(x => x.siteId === a); roomIds = data.rooms.filter(r => bls.some(x => x.id === r.buildingId)).map(r => r.id); label = `${D.site(a).name} (${bls.length} building(s))`; }
  else if (kind === 'building') { const bl = D.bldg(a); roomIds = data.rooms.filter(r => r.buildingId === a).map(r => r.id); label = `${bl.name} (${bl.floors.length} floor(s))`; }
  else if (kind === 'floor') { roomIds = data.rooms.filter(r => r.buildingId === a && r.floor === b).map(r => r.id); label = `${b} floor of ${D.bldg(a).name}`; }
  else if (kind === 'room') { roomIds = [a]; label = D.room(a).name; }
  else if (kind === 'bed') { const bd = D.bedO(a); return { label: `bed ${bd.label} in ${(D.room(bd.roomId) || {}).name}`, roomIds: [], bedIds: [a] }; }
  const q = new Set(roomIds);
  return { label, roomIds, bedIds: data.beds.filter(x => q.has(x.roomId)).map(x => x.id) };
}
export function structDelete(app, kind, a, b) {
  const { D, data, api } = app, p = structPlan(D, data, kind, a, b), bs = new Set(p.bedIds);
  const live = data.allocs.filter(x => x.active && bs.has(x.bedId));
  if (live.length) {
    const x = live[0];
    return app.openModal(<Info title="Cannot delete yet"><p><b>{live.length}</b> bed(s) in this {kind} are occupied or reserved — for example <b>{D.mName(x.memberId)}</b> in {D.bedShort(D.bedO(x.bedId))}.</p><p className="muted">Transfer or release those members first (Accommodation → Resident register), then delete.</p></Info>);
  }
  const pastN = data.allocs.filter(x => !x.active && bs.has(x.bedId)).length;
  const parts = []; if (p.roomIds.length) parts.push(`${p.roomIds.length} room(s)`); parts.push(`${p.bedIds.length} bed(s)`);
  const path = kind === 'floor' ? `${A}/floors/${a}?floor=${encodeURIComponent(b)}` : `${A}/${kind}s/${a}`;
  confirm(app, `Delete ${kind}`, <>Delete <b>{p.label}</b>?<br />This removes {parts.join(' and ')}.{pastN ? ` ${pastN} past stay record(s) keep the bed name in their history.` : ''}</>, 'Delete',
    async () => { const e = await app.run(() => api.del(path), ucase(kind) + ' deleted'); if (!e) app.setFs({ 'acc.site': '', 'acc.bld': '' }); }, true);
}
