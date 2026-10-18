/* Registration (visit) dialogs: pre-registration, walk-in, approval, reception, extensions. */
import { useApp } from '../context.jsx';
import { FormModal, Modal, CloseBtn, Info, DtForm, confirm } from '../components/Modal.jsx';
import { Badge, KV, Chip } from '../components/ui.jsx';
import { fd, fdt, today, nowLocal } from '@shared/dates.js';
import { TYPES, stayStart, stayEnd, stayType, pendingExt, stayTypeFor, stayDays, SHORT_MAX_DAYS, MONTHLY_MAX_DAYS } from '@shared/constants.js';

/* the stay type is set from the number of days (the server applies the same rule) */
const autoType = (from, to) => from && to && to >= from ? { type: stayTypeFor(from, to) } : null;
const typeHint = (from, to) => from && to && to >= from ? `Set automatically: ${stayDays(from, to)} day(s). Up to ${SHORT_MAX_DAYS} days = Short-Term, up to ${MONTHLY_MAX_DAYS} = Monthly, longer = Long-Term.` : 'Set automatically from the dates.';
import { memberAdd } from './members.jsx';

const memberLabel = m => m.id + ' · ' + m.name + ' · ' + m.mobile;
const pickId = s => (String(s).match(/NM-\d+/) || [])[0];

/** Pre-registration / walk-in form. `walk` → reception walk-in. */
function RegForm({ id, presetMember, walk, presetType }) {
  const app = useApp(), { D, me, api, mutate } = app;
  const ex = id ? D.reg(id) : null, isC = me.role === 'coordinator';
  const pool = D.members();
  const pm = presetMember ? D.member(presetMember) : (ex ? D.member(ex.memberId) : null);
  const auto = walk && D.isMgmt;
  const values = ex ? { ...ex, member: memberLabel(pm) }
    : { member: pm ? memberLabel(pm) : '', type: presetType || (pm ? pm.type : 'Short-Term'), branchId: pm ? pm.branchId : (isC ? me.branchId : ''), arrival: walk ? today() : '', prefDept: '' };
  if (isC && !D.inScope(values.branchId)) values.branchId = me.branchId;
  Object.assign(values, autoType(values.arrival, values.departure));
  const fields = [
    { n: 'member', l: 'Member (type ID, name or mobile)', req: 1, list: 'dlM', ro: !!ex, full: false, hint: ex ? '' : <a href="#" onClick={e => { e.preventDefault(); memberAdd(app, mid => app.openModal(<RegForm presetMember={mid} walk={walk} />)); }}>+ Create new member</a> },
    { n: 'branchId', l: 'Registering branch', t: 'select', opts: D.branchOpts(), req: 1, ph: 'Select branch', dis: isC && D.family.size <= 1 },
    { n: 'arrival', l: 'Arrival date', t: 'date', req: 1 }, { n: 'departure', l: 'Expected departure date', t: 'date', req: 1 },
    { n: 'type', l: 'Stay type', t: 'select', opts: TYPES, req: 1, dis: true, hint: v => typeHint(v.arrival, v.departure) }, { n: 'prefDept', l: 'Preferred sewa department', t: 'select', opts: D.deptOpts(), ph: 'No preference' },
    { n: 'purpose', l: 'Purpose of visit', t: 'textarea', req: 1, full: 1 }];
  const save = mode => async v => {
    const mid = pickId(v.member), m = mid && D.member(mid);
    if (!m) return 'Select an existing member from the list, or create a new member first.';
    if (v.departure < v.arrival) return 'Departure date cannot be before arrival.';
    let res;
    const err = await mutate(async () => {
      const b = { memberId: m.id, branchId: v.branchId, arrival: v.arrival, departure: v.departure, type: v.type, prefDept: v.prefDept, purpose: v.purpose, mode };
      res = ex ? await api.put('/regs/' + ex.id, b) : await api.post('/regs', b);
    }, null);
    if (!err) app.toast(res.status === 'Approved' ? `Walk-in approved — ready for check-in (${res.id})` : walk ? `Walk-in sent to Sewadar Manager for approval (${res.id})` : mode === 'submit' ? `Submitted for approval (${res.id})` : `Draft saved (${res.id})`, 'ok');
    return err;
  };
  return <FormModal title={walk ? 'Register walk-in visitor' : ex ? `Edit ${ex.id}` : 'New pre-registration'} wide values={values} fields={fields}
    datalists={{ dlM: pool.map(memberLabel) }}
    onChange={(n, v, all) => { if (n === 'member') { const m = D.member(pickId(v)); if (m) return { branchId: m.branchId }; } if (n === 'arrival' || n === 'departure') return autoType(all.arrival, all.departure); }}
    buttons={(walk ? [] : [{ label: 'Save draft', cls: '', run: save('draft') }]).concat([{ label: walk ? (auto ? 'Register & approve' : 'Send for approval') : 'Submit for approval', run: save(walk ? 'walkin' : 'submit') }])} />;
}
export const regNew = (app, memberId) => app.openModal(<RegForm presetMember={memberId || null} />);
export const regNewLT = app => app.openModal(<RegForm presetType="Monthly" />);
export const regEdit = (app, id) => app.openModal(<RegForm id={id} />);
export const walkin = (app, memberId) => app.openModal(<RegForm presetMember={memberId || null} walk />);

function RegView({ id }) {
  const { D } = useApp(), r = D.reg(id);
  if (!r) return <Info title="Request">This request no longer exists.</Info>;
  const m = D.member(r.memberId) || { id: r.memberId, name: '?', mobile: '' }, al = D.activeAlloc(id), du = D.activeDuty(id), pe = pendingExt(r);
  return <Modal title={`${r.id} — ${m.name}`} wide footer={<CloseBtn />}>
    <div className="chips" style={{ marginBottom: 12 }}><Badge s={r.status} /><Badge s={stayType(r)} />{r.source === 'Walk-in' ? <Chip>Walk-in</Chip> : null}{pe ? <Chip>Extension pending → {fd(pe.to)}</Chip> : null}</div>
    <KV items={[['Member', `${m.id} · ${m.mobile}`], ['Branch', D.bName(r.branchId)], ['Requested stay', `${fd(r.arrival)} – ${fd(r.departure)}`],
      ['Approved stay', r.approvedFrom ? fd(r.approvedFrom) + ' – ' + fd(r.approvedTo) : '—'], ['Preferred dept', D.dName(r.prefDept)], ['Approved dept', D.dName(r.approvedDept)],
      ['Actual arrival', fdt(r.actualIn)], ['Actual departure', fdt(r.actualOut)], ['Current bed', al ? D.bedPath(D.bedO(al.bedId)) : '—'],
      ['Current sewa', du ? D.dName(du.deptId) + ' · ' + du.shift : '—'], ['Purpose', r.purpose, true], r.remarks ? ['Management remarks', r.remarks, true] : null]} />
    <h3>Timeline</h3>
    <div className="tl">{r.history.length ? r.history.map((h, i) => <div key={i}><small>{fdt(h.at)} · {h.by}</small><br />{h.text}</div>) : '—'}</div>
  </Modal>;
}
export const regView = (app, id) => app.openModal(<RegView id={id} />);

export function extReq(app, id) {
  const { D, api, mutate } = app, r = D.reg(id);
  app.openModal(<FormModal title={`Request extension — ${D.mName(r.memberId)}`} fields={[{ n: 'to', l: `New end date (current: ${fd(stayEnd(r))})`, t: 'date', req: 1 }, { n: 'reason', l: 'Reason', t: 'textarea', req: 1, full: 1 }]}
    buttons={[{ label: 'Send request', run: v => v.to <= stayEnd(r) ? 'New end date must be after the current end date.' : mutate(() => api.post(`/regs/${id}/extension-request`, v), 'Extension request sent to management') }]} />);
}

/* ---------- pre-registration status changes ---------- */
export function regSubmit(app, id) { app.run(() => app.api.post(`/regs/${id}/submit`), 'Submitted for approval'); }
export function regWithdraw(app, id) { app.run(() => app.api.post(`/regs/${id}/withdraw`), 'Moved back to Draft — you can edit it now'); }
export function regReopen(app, id) { app.run(() => app.api.post(`/regs/${id}/reopen`), 'Moved back to Draft'); }
export function regDelete(app, id) {
  const { D } = app, r = D.reg(id); if (!r) return;
  if (!['Draft', 'Rejected', 'Cancelled'].includes(r.status) && !D.isMgmt) return app.toast('Only the Super Admin or Sewadar Manager can delete a processed request.', 'bad');
  confirm(app, 'Delete request', <>Permanently delete <b>{r.id}</b> ({D.mName(r.memberId)}) together with its bed and sewa records? This cannot be undone.</>, 'Delete',
    () => app.run(() => app.api.del('/regs/' + id), 'Request deleted'), true);
}
export function regCancel(app, id) {
  const { D, api, mutate } = app, r = D.reg(id);
  app.openModal(<FormModal title={`Cancel ${r.id} — ${D.mName(r.memberId)}`} pre={<div className="note">The request will be marked <b>Cancelled</b>{D.activeAlloc(r.id) ? ' and the reserved bed will be released' : ''}.</div>}
    fields={[{ n: 'why', l: 'Reason (optional)', t: 'textarea', full: 1 }]} buttons={[{ label: 'Cancel request', cls: 'bad', run: v => mutate(() => api.post(`/regs/${id}/cancel`, v), 'Request cancelled') }]} />);
}

/* ---------- approvals ---------- */
function ApproveForm({ id }) {
  const { D, api, mutate } = useApp(), r = D.reg(id), m = D.member(r.memberId) || { name: '?', id: r.memberId };
  const act = ok => v => {
    if (!ok && !v.remarks) return 'Remarks are required when rejecting a request.';
    if (ok && v.to < v.from) return 'Stay end cannot be before start.';
    return ok ? mutate(() => api.post(`/regs/${id}/approve`, v), 'Approved and forwarded to reception') : mutate(() => api.post(`/regs/${id}/reject`, { remarks: v.remarks }), 'Request rejected');
  };
  return <FormModal title={`Review ${r.id} — ${m.name}`} wide
    pre={<div className="note"><b>{m.name}</b> ({m.id}, {D.bName(r.branchId)}) requests <b>{fd(r.arrival)} – {fd(r.departure)}</b>. Purpose: {r.purpose}</div>}
    values={{ from: r.arrival, to: r.departure, type: stayTypeFor(r.arrival, r.departure), dept: r.prefDept, remarks: '' }}
    onChange={(n, v, all) => (n === 'from' || n === 'to') ? autoType(all.from, all.to) : null}
    fields={[{ n: 'from', l: 'Approved stay from', t: 'date', req: 1 }, { n: 'to', l: 'Approved stay to', t: 'date', req: 1 }, { n: 'type', l: 'Stay type', t: 'select', opts: TYPES, req: 1, dis: true, hint: v => typeHint(v.from, v.to) }, { n: 'dept', l: 'Sewa department', t: 'select', opts: D.deptOpts(), ph: 'Assign later' }, { n: 'remarks', l: 'Remarks (required for rejection)', t: 'textarea', full: 1 }]}
    buttons={[{ label: 'Reject', cls: 'bad', run: act(false) }, { label: 'Approve & forward to reception', cls: 'ok', run: act(true) }]} />;
}
export const approveOpen = (app, id) => app.openModal(<ApproveForm id={id} />);
export const apRevert = (app, id) => confirm(app, 'Revert approval', <>Send this request back to <b>Pending approval</b>? Any reserved bed and planned sewa will be released.</>, 'Revert', () => app.run(() => app.api.post(`/regs/${id}/revert`), 'Back in pending approvals'));
export const apReconsider = (app, id) => app.run(() => app.api.post(`/regs/${id}/reconsider`), 'Back in pending approvals');
export const extDecide = (app, id, approve) => app.run(() => app.api.post(`/regs/${id}/extension-decision`, { approve }), 'Extension ' + (approve ? 'approved' : 'rejected'));

/* ---------- reception ---------- */
export function rcArrive(app, id) {
  const { D, api, mutate } = app, r = D.reg(id);
  app.openModal(<DtForm title={`Confirm arrival — ${D.mName(r.memberId)}`} note={`Approved stay ${fd(stayStart(r))} – ${fd(stayEnd(r))}. Next steps: assign sewa department and a bed.`} label="Confirm arrival" def={nowLocal()}
    run={dt => mutate(() => api.post(`/regs/${id}/checkin`, { dt }), 'Arrival recorded — assign department and bed next')} />);
}
export function rcOut(app, id) {
  const { D, api, mutate } = app, r = D.reg(id), a = D.activeAlloc(id);
  app.openModal(<DtForm title={`Check out — ${D.mName(r.memberId)}`} note={a ? `Bed ${D.bedShort(D.bedO(a.bedId))} will be marked for cleaning and the active sewa duty will end.` : 'Active sewa duty will end.'} label="Check out" def={nowLocal()}
    run={dt => (dt < r.actualIn ? Promise.resolve('Departure cannot be before arrival.') : mutate(() => api.post(`/regs/${id}/checkout`, { dt }), 'Checked out'))} />);
}
export const rcUndoIn = (app, id) => confirm(app, 'Undo check-in', <>Mark <b>{app.D.mName(app.D.reg(id).memberId)}</b> as <b>not yet arrived</b> again? A bed already allocated stays reserved.</>, 'Undo check-in', () => app.run(() => app.api.post(`/regs/${id}/undo-checkin`), 'Check-in undone'));
export const rcUndoOut = (app, id) => confirm(app, 'Undo check-out', <>Put <b>{app.D.mName(app.D.reg(id).memberId)}</b> back as a current resident? Their bed and sewa are restored if the bed is still free.</>, 'Undo check-out', () => app.run(() => app.api.post(`/regs/${id}/undo-checkout`), 'Check-out undone'));
