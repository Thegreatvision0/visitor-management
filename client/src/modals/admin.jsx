/* Admin dialogs: users, option lists, access reset, data reset / backup, own password. */
import { useApp } from '../context.jsx';
import { FormModal, Info, confirm } from '../components/Modal.jsx';
import { sameName, today } from '@shared/dates.js';
import { VISIT_CAPS } from '@shared/constants.js';
import { BASE, getToken } from '../api.js';

const ROLE_TITLE = { supervisor: 'Add department head', office: 'Add Main Office user', security: 'Add Abhinandan Dwar security user' };
function UserForm({ id, role }) {
  const { D, data, api, mutate } = useApp(), ex = id ? data.users.find(u => u.id === id) : null;
  const roleCaps = r => (data.visitCaps || {})[r] || [];
  const capLabel = Object.fromEntries(VISIT_CAPS);
  /* department is typed: choose from the list or enter a new name (created when the user is saved) */
  const findDept = n => data.depts.find(d => d.name.toLowerCase() === String(n || '').trim().replace(/\s+/g, ' ').toLowerCase());
  const needsDept = v => v.role === 'supervisor' || (v.visitCaps || []).includes('incharge');
  return <FormModal title={ex ? 'Edit user' : ROLE_TITLE[role] || 'Add user'}
    values={ex ? { ...ex, password: '', visitCaps: ex.visitCaps || [], deptName: ex.deptId ? D.dName(ex.deptId) : '' } : { role: role || 'reception', visitCaps: [], deptName: '' }}
    datalists={{ userDeptList: data.depts.map(d => d.name) }}
    fields={[{ n: 'name', l: 'Display name', req: 1 }, { n: 'username', l: 'Username (for sign-in)', req: 1, ph: 'e.g. reception2' },
      { n: 'password', l: ex ? 'New password (leave empty to keep)' : 'Password', t: 'password', req: !ex, hint: 'At least 8 characters.' },
      { n: 'role', l: 'Role', t: 'select', opts: Object.keys(D.roles).map(r => ({ v: r, l: D.roles[r].label })), req: 1, ph: 'Select role' },
      { n: 'branchId', l: 'Branch (Branch Coordinator only)', t: 'select', opts: data.branches.map(b => ({ v: b.id, l: `${b.name} (${b.state})` })), ph: 'Select branch', hidden: v => v.role !== 'coordinator' },
      { n: 'deptName', l: 'Department (whose guest appointments this user accepts)', list: 'userDeptList', ph: 'Choose from the list or type a new department',
        hidden: v => !needsDept(v),
        hint: v => !String(v.deptName || '').trim() ? 'Pick an existing department or type a new name.' : findDept(v.deptName) ? 'Existing department.' : `New department “${String(v.deptName).trim()}” will be created, with this user as its head.` },
      /* extra guest visit permissions, on top of what the role already gives */
      { n: 'visitCaps', l: 'Extra Guest Visits permissions for this user', t: 'checks', full: 1,
        opts: v => VISIT_CAPS.filter(([k]) => !roleCaps(v.role).includes(k)).map(([k, l]) => ({ v: k, l })),
        hint: v => roleCaps(v.role).length ? 'Already given by the role: ' + roleCaps(v.role).map(k => capLabel[k]).join(' · ') : 'The role gives no Guest Visits permissions.' }]}
    buttons={[{
      label: 'Save', run: v => {
        if (v.role === 'coordinator' && !v.branchId) return 'A Branch Coordinator needs a branch.';
        const caps = (v.visitCaps || []).filter(k => !roleCaps(v.role).includes(k));
        const dn = String(v.deptName || '').trim();
        if (needsDept({ ...v, visitCaps: caps }) && !dn) return v.role === 'supervisor' ? 'A department head needs a department — choose one or type a new name.' : 'Choose the department whose appointments this user accepts.';
        const body = { ...v, visitCaps: caps, deptName: needsDept({ ...v, visitCaps: caps }) ? dn : '', deptId: '' };
        const isNew = body.deptName && !findDept(body.deptName);
        return mutate(() => ex ? api.put('/admin/users/' + id, body) : api.post('/admin/users', body), isNew ? `User saved — department “${dn}” created` : 'User saved');
      }
    }]} />;
}
export const userAdd = (app, role) => app.openModal(<UserForm role={role} />);
export const userEdit = (app, id) => app.openModal(<UserForm id={id} />);
export function userDelete(app, id) {
  const u = app.data.users.find(x => x.id === id); if (!u) return;
  if (u.id === app.me.id) return app.toast('You cannot delete the user you are signed in as.', 'bad');
  confirm(app, 'Delete user', <>Delete <b>{u.name}</b>?</>, 'Delete', () => app.run(() => app.api.del('/admin/users/' + id), 'User deleted'), true);
}

export function listAdd(app, k) {
  const { data, api, mutate } = app;
  app.openModal(<FormModal title={k === 'shifts' ? 'Add shift' : k === 'states' ? 'Add state / region' : 'Add relation'}
    fields={k === 'shifts' ? [{ n: 'name', l: 'Shift name', req: 1 }, { n: 'time', l: 'Timing (optional)', ph: 'e.g. 06:00–14:00' }] : [{ n: 'name', l: 'Name', req: 1 }]}
    buttons={[{ label: 'Add', run: v => data.lists[k].some(x => sameName(k === 'shifts' ? x.name : x, v.name)) ? 'This entry already exists.' : mutate(() => api.post('/admin/lists/' + k, v), 'Added') }]} />);
}
export function listDel(app, k, v) {
  const { data } = app;
  let used = 0, what = '';
  if (k === 'states') { used = data.branches.filter(b => b.state === v).length + data.members.filter(m => m.state === v).length; what = 'branches and members use the state'; }
  if (k === 'rels') { used = data.members.filter(m => m.emRel === v).length; what = 'members use the relation'; }
  if (k === 'shifts') { used = data.duties.filter(x => x.status === 'Active' && x.shift === v).length; what = 'active duties use the shift'; }
  if (used) return app.openModal(<Info title="Cannot remove"><p><b>{used}</b> {what} <b>{v}</b>. Change those first.</p></Info>);
  if (data.lists[k].length <= 1) return app.toast('Keep at least one entry in the list.', 'bad');
  confirm(app, 'Remove from list', <>Remove <b>{v}</b>?</>, 'Remove', () => app.run(() => app.api.del(`/admin/lists/${k}?name=${encodeURIComponent(v)}`), 'Removed'), true);
}
export function shiftEdit(app, name) {
  const x = app.data.lists.shifts.find(y => y.name === name); if (!x) return;
  app.openModal(<FormModal title={`Edit shift — ${x.name}`} values={{ time: x.time || '' }} fields={[{ n: 'time', l: 'Timing', ph: 'e.g. 05:00–13:00' }]}
    buttons={[{ label: 'Save', run: v => app.mutate(() => app.api.put(`/admin/lists/shifts?name=${encodeURIComponent(name)}`, v), 'Shift updated') }]} />);
}
export const setPerm = (app, role, page, value) => app.run(() => app.api.put('/admin/perms', { role, page, value }), 'Access updated');
export const permReset = app => confirm(app, 'Reset access', 'Restore every role to its default page access?', 'Reset', () => app.run(() => app.api.post('/admin/perms/reset'), 'Access reset to defaults'));

export const admClearPeople = app => confirm(app, 'Delete all members & visits', <>Delete <b>all {app.data.members.length} members</b>, {app.data.regs.length} requests, bed allocations, sewa duties and attendance? Branches, departments, buildings, rooms, beds, users and settings are kept.</>, 'Delete people & visits',
  () => app.run(() => app.api.post('/admin/clear-people'), 'All members and visits deleted'), true);
export const admClearAll = app => confirm(app, 'Delete everything', 'Empty the whole system — members, visits, branches, departments and every site, building, room and bed? Users, access settings and option lists are kept. You can then add your own data by hand.', 'Delete everything',
  async () => { const e = await app.run(() => app.api.post('/admin/clear-all'), 'System emptied — start adding your own data'); if (!e) app.setFs({ 'acc.site': '', 'acc.bld': '' }); }, true);
export const admReset = app => confirm(app, 'Reset data', 'Replace all data with fresh sample data? Every change made so far will be lost. Sign-in users are kept.', 'Reset',
  () => app.run(() => app.api.post('/admin/reset-sample'), 'Sample data restored'), true);

export async function admExport(app) {
  try {
    const res = await fetch(BASE + '/admin/export', { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!res.ok) throw new Error('Export failed');
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = 'nurmahal_backup_' + today() + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { app.toast(e.message, 'bad'); }
}
/** Accepts backups from this app and from the old browser-only prototype. */
export function admImport(app, file) {
  const rd = new FileReader();
  rd.onload = () => {
    let d; try { d = JSON.parse(rd.result); } catch { return app.toast('Not a valid backup file', 'bad'); }
    confirm(app, 'Import backup', 'Replace ALL current data with the contents of this backup? Sign-in users are kept.', 'Import',
      () => app.run(() => app.api.post('/admin/import', d), 'Backup imported'), true);
  };
  rd.readAsText(file);
}

export function changePassword(app) {
  app.openModal(<FormModal title="Change password" fields={[{ n: 'current', l: 'Current password', t: 'password', req: 1 }, { n: 'next', l: 'New password', t: 'password', req: 1, hint: 'At least 8 characters.' }, { n: 'again', l: 'Repeat new password', t: 'password', req: 1 }]}
    buttons={[{ label: 'Change password', run: v => v.next !== v.again ? 'The new passwords do not match.' : app.mutate(() => app.api.post('/auth/password', v), 'Password changed') }]} />);
}

/** Add / update every branch from the official DJJS list (djjs.org/contact). */
export const admImportBranches = app => confirm(app, 'Load official DJJS branch list',
  <>Add all branches listed on <b>djjs.org/contact</b> and update branches that have the same name (coordinator, phones, email, address)? Existing members and visits stay linked to their branches.</>, 'Load branches',
  async () => {
    let r;
    const e = await app.run(async () => { r = await app.api.post('/admin/import-djjs-branches'); }, null);
    if (!e) app.openModal(<Info title="Official branches loaded"><p><b>{r.created}</b> branch(es) added and <b>{r.updated}</b> updated — {r.total} on the official list (fetched {r.fetched}).</p>
      {r.sampleLeft.length ? <p className="muted">{r.sampleLeft.length} sample branch(es) that are not on the official list are still in the system: {r.sampleLeft.join(', ')}. Delete them from the Branches page (or with Admin → Data → Delete everything) when you go live.</p> : null}</Info>);
  });

/* guest visit permissions per role */
export const setVisitCap = (app, role, cap, on) => app.run(() => app.api.put('/admin/visit-caps', { role, cap, on }), 'Guest visit access updated');
export const visitCapsReset = app => confirm(app, 'Reset guest visit access', 'Restore every role to its default guest visit permissions? Extra permissions given to individual users are kept.', 'Reset', () => app.run(() => app.api.post('/admin/visit-caps/reset'), 'Guest visit access reset'));
