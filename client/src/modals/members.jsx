/* Member Master and Branch dialogs. */
import { useApp } from '../context.jsx';
import { FormModal, Modal, CloseBtn, Info, confirm } from '../components/Modal.jsx';
import { Avatar, Badge, Table, Btn, KV, Chip } from '../components/ui.jsx';
import { fd, fdt, ageOf, today } from '@shared/dates.js';
import { TYPES, GENDERS, stayStart, stayEnd, stayType, LIVE } from '@shared/constants.js';
import { regNew, regView } from './regs.jsx';

/* ---------- members ---------- */
function MemberForm({ id, after }) {
  const app = useApp(), { D, me, api, mutate } = app;
  const ex = id ? D.member(id) : null, isC = me.role === 'coordinator', myB = D.branch(me.branchId) || {};
  const fields = [{ n: 'name', l: 'Full name', req: 1 }, { n: 'mobile', l: 'Mobile number', t: 'tel', req: 1, ph: '10-digit mobile' }, { n: 'dob', l: 'Date of birth', t: 'date', req: 1 },
    { n: 'gender', l: 'Gender', t: 'select', opts: GENDERS, req: 1, ph: 'Select' }, { n: 'type', l: 'Member type', t: 'select', opts: TYPES, req: 1 },
    { n: 'state', l: 'State', t: 'select', opts: D.STATES, req: 1, ph: 'Select state first' },
    { n: 'branchId', l: 'Branch / sub-branch', t: 'select', req: 1, opts: v => D.branchOpts().filter(o => !v.state || o.state === v.state),
      ph: 'Select branch', hint: v => v.state && !D.branchOpts().some(o => o.state === v.state) ? `No branch in ${v.state} yet — add it under Branches first.` : '' },
    { n: 'district', l: 'District', req: 1 },
    { n: 'address', l: 'Address', t: 'textarea', req: 1, full: 1 }, { n: 'emName', l: 'Emergency contact name', req: 1 }, { n: 'emPhone', l: 'Emergency contact mobile', t: 'tel', req: 1 },
    { n: 'emRel', l: 'Relation', t: 'select', opts: D.RELS, ph: 'Select' }, { n: 'photo', l: 'Photo (optional)', t: 'photo', full: 1 }];
  const values = ex ? { ...ex } : { type: 'Short-Term', branchId: isC ? me.branchId : '', state: isC ? (myB.state || 'Punjab') : 'Punjab', district: isC ? (myB.district || '') : '' };
  return <FormModal title={ex ? `Edit member — ${ex.id}` : 'Add member'} wide fields={fields} values={values}
    onChange={(n, v) => { if (n === 'branchId') { const b = D.branch(v); if (b) return { state: b.state, district: b.district }; } }} /* changing state clears a branch from another state */
    buttons={[{
      label: ex ? 'Save changes' : 'Create member', run: async v => {
        if (v.dob > today()) return 'Date of birth cannot be in the future.';
        let newId;
        const err = await mutate(async () => { const r = ex ? await api.put('/members/' + ex.id, v) : await api.post('/members', v); newId = r.id; }, null);
        if (!err) { app.toast(ex ? 'Member updated' : `Member created: ${newId}`, 'ok'); if (after) after(newId); }
        return err;
      }
    }]} />;
}
export const memberAdd = (app, after) => app.openModal(<MemberForm after={after} />);
export const memberEdit = (app, id) => app.openModal(<MemberForm id={id} />);

function MemberView({ id }) {
  const app = useApp(), { D, data } = app, m = D.member(id);
  if (!m) return <Info title="Member">This member no longer exists.</Info>;
  const rs = data.regs.filter(r => r.memberId === id).sort((a, b) => stayStart(b).localeCompare(stayStart(a)));
  const als = data.allocs.filter(a => a.memberId === id).sort((a, b) => b.from.localeCompare(a.from)), dus = data.duties.filter(x => x.memberId === id).sort((a, b) => b.from.localeCompare(a.from));
  const st = D.memberStatus(m);
  return <Modal title={<>{m.name} <small>{m.id}</small></>} wide footer={<>
    {D.canEditMember(m) ? <><button className="btn dng" onClick={() => memberDelete(app, id)}>Delete member</button><button className="btn" onClick={() => memberEdit(app, id)}>Edit member</button></> : null}
    {D.canEdit('prereg') ? <button className="btn pri" onClick={() => regNew(app, id)}>New pre-registration</button> : null}
    <CloseBtn /></>}>
    <div className="who" style={{ marginBottom: 12 }}><Avatar m={m} /><div className="chips"><Badge s={m.type} />{st ? <Badge s={st} /> : null}{m.sample ? <Chip>Sample record</Chip> : null}</div></div>
    <KV items={[['Mobile', m.mobile], ['Age / DOB', `${ageOf(m.dob)} yrs · ${fd(m.dob)}`], ['Gender', m.gender], ['Branch', D.bName(m.branchId)], ['State / District', `${m.state} / ${m.district}`],
      ['Emergency contact', `${m.emName} ${m.emRel ? '(' + m.emRel + ')' : ''} · ${m.emPhone}`], ['Address', m.address, true]]} />
    <h3>Visit history</h3>
    <Table cols={[['Request', r => r.id], ['Stay', r => `${fd(stayStart(r))} – ${fd(stayEnd(r))}`], ['Type', r => <Badge s={stayType(r)} />], ['Actual', r => <>{fdt(r.actualIn)}<br /><small>{r.actualOut ? fdt(r.actualOut) : ''}</small></>], ['Status', r => <Badge s={r.status} />], ['', r => <Btn onClick={() => regView(app, r.id)}>Details</Btn>]]} rows={rs} empty="No visits recorded." />
    <h3 style={{ marginTop: 14 }}>Accommodation history</h3>
    <Table cols={[['Bed', a => D.allocBedText(a)], ['From', a => fd(a.from)], ['To', a => fd(a.to)], ['Note', a => a.active ? a.reason : (a.endReason || 'Closed')]]} rows={als} empty="No bed allocations." />
    <h3 style={{ marginTop: 14 }}>Sewa history</h3>
    <Table cols={[['Department', x => D.dName(x.deptId)], ['Shift', x => x.shift], ['From', x => fd(x.from)], ['To', x => fd(x.to)], ['Status', x => <Badge s={x.status} />], ['Attendance', x => D.attPct(x.regId) == null ? '—' : D.attPct(x.regId) + '% present']]} rows={dus} empty="No sewa assignments." />
    <MemberAttendance id={id} />
  </Modal>;
}

/** Overall attendance & performance of a member across all visits. */
function MemberAttendance({ id }) {
  const { D } = useApp(), a = D.memberAtt(id);
  const tile = (v, l, cls) => <div className="stat"><div className="v" style={cls ? { color: `var(--${cls})` } : null}>{v}</div><div className="l">{l}</div></div>;
  return <>
    <h3 style={{ marginTop: 14 }}>Attendance &amp; performance</h3>
    {a.total ? <>
      <div className="grid g4" style={{ marginBottom: 10 }}>
        {tile(a.pct + '%', 'Present (overall)', a.pct >= 75 ? 'ok' : a.pct >= 50 ? 'warn' : 'bad')}{tile(a.rating, 'Performance')}
        {tile(a.Present, 'Days present', 'ok')}{tile(a.Absent, 'Days absent', 'bad')}{tile(a.Leave, 'Days on leave', 'warn')}{tile(a.total, 'Days marked')}
      </div>
      <Table rows={a.rows.slice(0, 30)} rowKey={x => x.date + x.regId} cols={[['Date', x => fd(x.date)], ['Visit', x => x.regId], ['Department', x => D.dName(x.deptId)], ['Attendance', x => <Badge s={x.status} />]]} />
      {a.rows.length > 30 ? <p className="muted">Showing the latest 30 of {a.rows.length} records. The full list is in Reports → Member attendance &amp; performance.</p> : null}
    </> : <div className="empty">No attendance recorded yet.</div>}
  </>;
}
export const memberView = (app, id) => app.openModal(<MemberView id={id} />);

export function memberDelete(app, id) {
  const { D, data } = app, m = D.member(id); if (!m) return;
  const rs = data.regs.filter(r => r.memberId === m.id), live = rs.find(r => LIVE.includes(r.status));
  if (live) return app.openModal(<Info title="Cannot delete member"><p><b>{m.name}</b> has a live request ({live.id} — {live.status}). Reject or cancel it, or check the member out, first.</p></Info>);
  if (rs.length && !D.isMgmt) return app.openModal(<Info title="Cannot delete member"><p><b>{m.name}</b> has {rs.length} past visit record(s). Only the Super Admin or Sewadar Manager can delete a member together with their history.</p></Info>);
  confirm(app, 'Delete member', <>Permanently delete <b>{m.name}</b> ({m.id})?{rs.length ? ` Their ${rs.length} visit record(s) and all bed and sewa history are deleted too.` : ''} This cannot be undone.</>, 'Delete member',
    () => app.run(() => app.api.del('/members/' + m.id), 'Member deleted'), true);
}

/* ---------- branches ---------- */
function BranchForm({ id, parentId }) {
  const { D, me, data, api, mutate } = useApp(), ex = id ? D.branch(id) : null, isC = me.role === 'coordinator';
  const own = ex && isC && ex.id === me.branchId; // a coordinator's own branch stays where it is
  /* a branch cannot sit under itself or its own sub-branches */
  const below = new Set(); if (ex) { below.add(ex.id); data.branches.forEach(() => data.branches.forEach(b => { if (below.has(b.parentId)) below.add(b.id); })); }
  const parents = D.branchOpts().filter(o => !below.has(o.v));
  const par = parentId ? D.branch(parentId) : null;
  const values = ex ? { ...ex, parentId: ex.parentId || '' } : par ? { parentId: par.id, state: par.state, district: par.district } : { state: isC ? (D.branch(me.branchId) || {}).state : 'Punjab', parentId: isC ? me.branchId : '' };
  return <FormModal title={ex ? `Edit branch — ${ex.name}` : par ? `Add sub-branch under ${par.name}` : 'Add branch'} values={values}
    fields={[{ n: 'name', l: 'Branch name (must be unique)', req: 1 },
      { n: 'parentId', l: 'Parent branch', t: 'select', opts: parents, ph: isC ? undefined : '— None (main branch) —', dis: own, hidden: own,
        hint: 'Choose a parent to make this a sub-branch — for dividing a large branch into smaller ones.' },
      { n: 'state', l: 'State', t: 'select', opts: D.STATES, req: 1, ph: 'Select', dis: v => !!v.parentId, hint: v => v.parentId ? 'A sub-branch is always in its parent branch’s state.' : '' },
      { n: 'district', l: 'District', req: 1 }, { n: 'coordinator', l: 'Coordinator name', req: 1 }, { n: 'phone', l: 'Coordinator mobile', t: 'tel', req: 1 },
      { n: 'phones', l: 'Other phone numbers', ph: 'e.g. +91-99157-61834, 0161-2345678' }, { n: 'email', l: 'Email', t: 'email', ph: 'e.g. in.pb.ldh@djjs.org' },
      { n: 'address', l: 'Address', t: 'textarea', full: 1 }]}
    onChange={(n, v) => { if (n === 'parentId' && v) { const p = D.branch(v); if (p) return { state: p.state }; } }}
    buttons={[{ label: 'Save', run: v => mutate(() => ex ? api.put('/branches/' + id, v) : api.post('/branches', v), 'Branch saved') }]} />;
}
export const branchAdd = (app, parentId) => app.openModal(<BranchForm parentId={parentId} />);
export const branchEdit = (app, id) => app.openModal(<BranchForm id={id} />);

function BranchView({ id }) {
  const { D, data } = useApp(), b = D.branch(id);
  if (!b) return <Info title="Branch">This branch no longer exists.</Info>;
  const ms = data.members.filter(m => m.branchId === id), rs = data.regs.filter(r => r.branchId === id).sort((a, c) => stayStart(c).localeCompare(stayStart(a)));
  return <Modal title={`${b.name} branch`} wide footer={<CloseBtn />}>
    <KV items={[['State / District', `${b.state} / ${b.district}`], ['Coordinator', `${b.coordinator} · ${b.phone}`],
      b.parentId ? ['Sub-branch of', D.bName(b.parentId)] : null,
      b.phones && b.phones.replace(/\D/g, '').slice(-10) !== b.phone ? ['Phone numbers', b.phones] : null,
      b.email ? ['Email', <a href={'mailto:' + b.email}>{b.email}</a>] : null, b.address ? ['Address', b.address, true] : null]} />
    <h3>Registered members ({ms.length})</h3>
    <Table cols={[['ID', m => m.id], ['Name', m => m.name], ['Mobile', m => m.mobile], ['Type', m => <Badge s={m.type} />], ['Status', m => D.memberStatus(m) ? <Badge s={D.memberStatus(m)} /> : '—']]} rows={ms} />
    <h3 style={{ marginTop: 14 }}>Pre-registration &amp; arrivals ({rs.length})</h3>
    <Table cols={[['Request', r => r.id], ['Member', r => D.mName(r.memberId)], ['Stay', r => `${fd(stayStart(r))} – ${fd(stayEnd(r))}`], ['Arrived', r => fdt(r.actualIn)], ['Status', r => <Badge s={r.status} />]]} rows={rs} />
  </Modal>;
}
export const branchView = (app, id) => app.openModal(<BranchView id={id} />);

export function branchDelete(app, id) {
  const { D, data, api } = app, b = D.branch(id); if (!b) return;
  const subs = data.branches.filter(x => x.parentId === b.id);
  if (subs.length) return app.openModal(<Info title="Cannot delete branch"><p><b>{b.name}</b> has {subs.length} sub-branch(es): {subs.map(x => x.name).join(', ')}. Delete them or move them under another branch first.</p></Info>);
  const ms = data.members.filter(m => m.branchId === b.id).length, rs = data.regs.filter(r => r.branchId === b.id).length, us = data.users.filter(u => u.branchId === b.id).length;
  if (!ms && !rs && !us) return confirm(app, 'Delete branch', <>Delete <b>{b.name}</b>? It has no members or requests.</>, 'Delete', () => app.run(() => api.del('/branches/' + b.id), 'Branch deleted'), true);
  app.openModal(<FormModal title={`Delete branch — ${b.name}`}
    pre={<div className="note">This branch has <b>{ms}</b> member(s), <b>{rs}</b> request(s) and <b>{us}</b> linked user(s). Choose a branch to move them to; then this branch is deleted.</div>}
    fields={[{ n: 'to', l: 'Move everything to', t: 'select', opts: D.branchOpts().filter(x => x.v !== b.id).map(x => ({ v: x.v, l: `${x.l} (${x.state})` })), req: 1, ph: 'Select branch' }]}
    buttons={[{ label: 'Move & delete branch', cls: 'bad', run: v => app.mutate(() => api.del(`/branches/${b.id}?moveTo=${encodeURIComponent(v.to)}`), 'Branch deleted; records moved') }]} />);
}
