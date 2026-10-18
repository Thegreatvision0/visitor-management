/* Sewa departments, duties and attendance dialogs. */
import { useApp } from '../context.jsx';
import { FormModal, Info, confirm } from '../components/Modal.jsx';
import { fd, today, dayOf } from '@shared/dates.js';
import { stayStart, stayEnd } from '@shared/constants.js';

function DutyForm({ regId, change }) {
  const { D, me, api, mutate } = useApp();
  const r = D.reg(regId), cur = D.activeDuty(regId), m = D.member(r.memberId) || { name: '?' }, t = today();
  const startDef = change ? t : (r.actualIn && dayOf(r.actualIn) > stayStart(r) ? dayOf(r.actualIn) : (stayStart(r) > t ? stayStart(r) : t));
  const values = { deptId: change ? cur.deptId : (r.approvedDept || ''), shift: change ? cur.shift : (D.SHIFTS[0] || ''), supervisor: change ? cur.supervisor : ((D.dept(r.approvedDept) || {}).supervisor || ''), from: startDef, to: stayEnd(r) };
  return <FormModal title={`${change ? 'Change' : 'Assign'} sewa — ${m.name}`} values={values}
    pre={<div className="note">Approved stay {fd(stayStart(r))} – {fd(stayEnd(r))}{change ? <><br />Current: {D.dName(cur.deptId)}, {cur.shift} shift — kept in history.</> : null}</div>}
    fields={[{ n: 'deptId', l: 'Department', t: 'select', opts: D.deptOpts().filter(o => me.role !== 'supervisor' || o.v === me.deptId), req: 1, ph: 'Select' },
      { n: 'shift', l: 'Shift', t: 'select', opts: D.SHIFTS.map(x => ({ v: x, l: D.shiftLbl(x) })), req: 1 },
      { n: 'supervisor', l: 'Supervisor (auto-filled from the department; change if needed)', full: 1 }, { n: 'from', l: 'Duty start', t: 'date', req: 1 }, { n: 'to', l: 'Duty end', t: 'date', req: 1 }]}
    onChange={(n, v) => { if (n === 'deptId') { const d = D.dept(v); if (d) return { supervisor: d.supervisor || '' }; } }}
    buttons={[{ label: change ? 'Save change' : 'Assign', run: v => mutate(() => api.post(`/regs/${regId}/duty`, { ...v, replace: !!change }), 'Sewa saved') }]} />;
}
export const dutyAssign = (app, regId) => app.openModal(<DutyForm regId={regId} />);
export const dutyChange = (app, regId) => app.openModal(<DutyForm regId={regId} change />);
/** Extend the sewa (duty end date). If the new date is past the approved stay, the stay is extended too. */
export function dutyExtend(app, regId) {
  const { D, api, mutate } = app, r = D.reg(regId), du = D.activeDuty(regId);
  if (!du) return app.toast('This member has no active sewa duty.', 'bad');
  const canStay = D.canEdit('accommodation') || D.canEdit('approvals'), over = stayEnd(r) < today();
  app.openModal(<FormModal title={`Extend sewa — ${D.mName(r.memberId)}`}
    pre={<div className="note">{D.dName(du.deptId)}, {du.shift} shift · duty ends <b>{fd(du.to)}</b> · approved stay ends <b>{fd(stayEnd(r))}</b>{over ? <> <span className="b bad">stay date crossed</span></> : null}
      <br />{canStay ? 'If the new date is after the approved stay, the stay (and bed, if free) is extended too.' : 'The new date must be within the approved stay — otherwise ask the Sewadar Manager to extend the stay.'}</div>}
    fields={[{ n: 'to', l: 'New sewa end date', t: 'date', req: 1 }, { n: 'note', l: 'Reason', full: 1 }]}
    buttons={[{ label: 'Extend sewa', run: v => mutate(() => api.post(`/regs/${regId}/duty/extend`, v), 'Sewa extended') }]} />);
}
export const dutyEnd =(app, regId) => confirm(app, 'End duty', 'End this sewa assignment today? It stays in history.', 'End duty', () => app.run(() => app.api.post(`/regs/${regId}/duty/end`), 'Duty ended'));
export function dutyDelete(app, id) {
  const { D, data } = app, x = data.duties.find(d => d.id === id); if (!x) return;
  confirm(app, 'Delete duty record', `Delete this duty record (${D.mName(x.memberId)} — ${D.dName(x.deptId)}, ${fd(x.from)} – ${fd(x.to)})? Attendance already marked is kept.`, 'Delete',
    () => app.run(() => app.api.del('/duties/' + id), 'Duty record deleted'), true);
}

function DeptForm({ id }) {
  const { D, api, mutate } = useApp(), ex = id ? D.dept(id) : null;
  return <FormModal title={ex ? 'Edit department' : 'Add department'} values={ex ? { name: ex.name, supervisor: ex.supervisor, active: ex.active ? 'Yes' : 'No' } : { active: 'Yes' }}
    fields={[{ n: 'name', l: 'Department name', req: 1 }, { n: 'supervisor', l: 'Supervisor', req: 1 }, { n: 'active', l: 'Active', t: 'select', opts: ['Yes', 'No'], req: 1 }]}
    buttons={[{ label: 'Save', run: v => mutate(() => ex ? api.put('/depts/' + id, v) : api.post('/depts', v), 'Department saved') }]} />;
}
export const deptAdd = app => app.openModal(<DeptForm />);
export const deptEdit = (app, id) => app.openModal(<DeptForm id={id} />);
export function deptDelete(app, id) {
  const { D, data } = app, x = D.dept(id); if (!x) return;
  const act = data.duties.filter(u => u.deptId === x.id && u.status === 'Active').length, past = data.duties.filter(u => u.deptId === x.id).length - act;
  if (act) return app.openModal(<Info title="Cannot delete department"><p><b>{act}</b> sewadar are currently assigned to <b>{x.name}</b>. Change or end those duties first — or edit the department and set it to <b>inactive</b> instead.</p></Info>);
  confirm(app, 'Delete department', <>Delete <b>{x.name}</b>?{past ? ` ${past} past duty record(s) keep the department name in their history.` : ''}</>, 'Delete', () => app.run(() => app.api.del('/depts/' + id), 'Department deleted'), true);
}

export const setAtt = (app, date, regId, status) => app.run(() => app.api.post('/attendance', { date, regId, status }), 'Attendance saved');
export const attAll = (app, date, deptId) => app.run(() => app.api.post('/attendance/mark-all', { date, deptId: deptId || '' }), 'Unmarked members set to Present');
