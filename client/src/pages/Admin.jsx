import { useRef } from 'react';
import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Tabs, useTab, Chip, FInput, FSelect } from '../components/ui.jsx';
import { fdt } from '@shared/dates.js';
import { VISIT_CAPS } from '@shared/constants.js';
import { NAV } from '../components/Layout.jsx';
import { userAdd, userEdit, userDelete, listAdd, listDel, shiftEdit, setPerm, permReset, admClearPeople, admClearAll, admReset, admExport, admImport, admImportBranches, setVisitCap, visitCapsReset } from '../modals/admin.jsx';

export default function Admin() {
  const app = useApp(), { data } = app, tab = useTab('admin', 'd');
  const body = { d: <DataTab />, u: <UsersTab />, r: <RolesTab />, g: <VisitAccessTab />, l: <ListsTab />, a: <AuditTab /> }[tab] || <DataTab />;
  return <>
    <PageHead title="Admin" sub="Super Admin only. Manage users, access, option lists and data." />
    <div className="card"><Tabs page="admin" list={[['d', 'Data'], ['u', 'Users', data.users.length], ['r', 'Roles & access'], ['g', 'Guest visit access'], ['l', 'Lists & options'], ['a', 'Audit log']]} />{body}</div>
  </>;
}

function DataTab() {
  const app = useApp(), { data } = app, file = useRef(null);
  const n = [['Members', data.members.length], ['Requests', data.regs.length], ['Branches', data.branches.length], ['Departments', data.depts.length], ['Beds', data.beds.length], ['Allocations', data.allocs.length], ['Duties', data.duties.length], ['Attendance marks', Object.keys(data.att).length]];
  return <div className="grid g2">
    <div><h3>Data</h3><div className="kv">{n.map(([k, v]) => <div key={k}><span>{k}</span>{v}</div>)}</div>
      <div className="acts"><button className="btn" onClick={() => admExport(app)}>Download JSON backup</button><button className="btn" onClick={() => file.current.click()}>Import JSON</button></div>
      <input type="file" ref={file} accept="application/json" hidden onChange={e => { const f = e.target.files[0]; if (f) admImport(app, f); e.target.value = ''; }} />
      <p className="muted">Import also accepts a backup downloaded from the old browser-only prototype.</p></div>
    <div><h3>Official DJJS branches</h3><p className="muted" style={{ marginTop: 0 }}>Adds every branch listed on djjs.org/contact (name, state, coordinator, phones, email, address) and updates branches with the same name. Members and visits stay linked. Safe to run again.</p>
      <div className="acts"><button className="btn pri" onClick={() => admImportBranches(app)}>Load official DJJS branch list</button></div></div>
    <div><h3>Start fresh / reset</h3><p className="muted" style={{ marginTop: 0 }}>Remove the sample records and enter your own by hand — everything can also be added, edited and deleted one by one in its own page.</p>
      <div className="acts"><button className="btn dng" onClick={() => admClearPeople(app)}>Delete all members &amp; visits</button><button className="btn dng" onClick={() => admClearAll(app)}>Delete everything (empty system)</button><button className="btn dng" onClick={() => admReset(app)}>Reset to sample data</button></div></div>
  </div>;
}

function UsersTab() {
  const app = useApp(), { D, data, me, ui } = app, rf = ui.f['us.role'] || '', q = (ui.f['us.q'] || '').toLowerCase();
  const count = r => data.users.filter(u => u.role === r).length;
  const L = data.users.filter(u => (!rf || u.role === rf) && (!q || (u.name + u.username + D.dName(u.deptId)).toLowerCase().includes(q)));
  return <>
    <div className="acts" style={{ marginBottom: 10 }}><PBtn onClick={() => userAdd(app)}>+ Add user</PBtn>
      {/* quick add for the guest visit roles */}
      <button className="btn" onClick={() => userAdd(app, 'supervisor')}>+ Department head</button>
      <button className="btn" onClick={() => userAdd(app, 'office')}>+ Main Office</button>
      <button className="btn" onClick={() => userAdd(app, 'security')}>+ Abhinandan Dwar security</button></div>
    <div className="filters"><FInput k="us.q" ph="Search name, username, department…" />
      <FSelect k="us.role" opts={Object.keys(D.roles).map(r => ({ v: r, l: `${D.roles[r].label} (${count(r)})` }))} all={`All roles (${data.users.length})`} /></div>
    <Table rows={L} empty="No users match." cols={[['Name', u => <><b>{u.name}</b>{u.id === me.id ? <> <Chip>you</Chip></> : null}</>], ['Username', u => u.username], ['Role', u => (D.roles[u.role] || {}).label || u.role],
      ['Guest visits', u => { const c = [...new Set([...((data.visitCaps || {})[u.role] || []), ...(u.visitCaps || [])])]; return c.length ? <>{c.map(k => <Chip key={k}>{CAP_SHORT[k]}</Chip>)}{(u.visitCaps || []).length ? <><br /><small>+ {u.visitCaps.length} extra for this user</small></> : null}</> : <span className="muted">—</span>; }],
      ['Scope', u => u.role === 'coordinator' ? ((D.branch(u.branchId) || {}).name || '— no branch set —') : u.role === 'supervisor' ? <>{(D.dept(u.deptId) || {}).name || '— no department set —'}<br /><small>own guests only</small></> : 'All records'],
      ['', u => <><Btn onClick={() => userEdit(app, u.id)}>Edit</Btn><Btn cls="dng" onClick={() => userDelete(app, u.id)}>Delete</Btn></>]]} />
    <p className="muted">Passwords are stored as bcrypt hashes on the server. Set a new password with Edit.</p>
  </>;
}

function RolesTab() {
  const app = useApp(), { D } = app, pages = NAV.filter(n => n[0] !== 'admin'), roles = Object.keys(D.roles).filter(r => r !== 'superadmin');
  return <>
    <p className="muted" style={{ marginTop: 0 }}>Choose what each role can open. <b>View</b> = see only; <b>Edit</b> = add, change and delete. Branch coordinators still see only their own branch and department supervisors only their own department. Super Admin always has full access. The server enforces these settings.</p>
    <div className="tw"><table><thead><tr><th>Page</th>{roles.map(r => <th key={r}>{D.roles[r].label}</th>)}</tr></thead>
      <tbody>{pages.map(p => <tr key={p[0]}><td><b>{p[1]}</b></td>{roles.map(r => {
        const v = D.roles[r].pages[p[0]] || '', lock = p[0] === 'dashboard';
        return <td key={r}><select className="in" value={v} disabled={lock} onChange={e => setPerm(app, r, p[0], e.target.value)}>
          {[{ v: '', l: '—' }, { v: 'v', l: 'View' }, { v: 'e', l: 'Edit' }].filter(o => !lock || o.v).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></td>;
      })}</tr>)}</tbody></table></div>
    <div className="acts" style={{ marginTop: 12 }}><button className="btn" onClick={() => permReset(app)}>Reset to defaults</button></div>
  </>;
}

const CAP_SHORT = { invite: 'Invite', incharge: 'Accept (in-charge)', office: 'Main Office', gate: 'Gate', all: 'See all' };

/** Which role may do which step of a guest visit. Extra permissions for one person are set on the user (Users → Edit). */
function VisitAccessTab() {
  const app = useApp(), { D, data } = app, caps = data.visitCaps || {}, roles = Object.keys(caps);
  return <>
    <p className="muted" style={{ marginTop: 0 }}>Tick what each role may do in <b>Guest Visits</b>. A department in-charge accepts only their own department's appointments. To give one person an extra step (e.g. a reception user who also handles the gate), edit that user under <b>Users</b>. Super Admin always has everything.</p>
    <div className="tw"><table><thead><tr><th>Permission</th>{roles.map(r => <th key={r}>{(D.roles[r] || {}).label || r}</th>)}</tr></thead>
      <tbody>{VISIT_CAPS.map(([k, l]) => <tr key={k}><td><b>{l}</b></td>{roles.map(r => <td key={r} style={{ textAlign: 'center' }}>
        <input type="checkbox" style={{ width: 18, height: 18 }} checked={(caps[r] || []).includes(k)} disabled={r === 'superadmin'} aria-label={l + ' — ' + r} onChange={e => setVisitCap(app, r, k, e.target.checked)} /></td>)}</tr>)}</tbody></table></div>
    <div className="acts" style={{ marginTop: 12 }}><button className="btn" onClick={() => visitCapsReset(app)}>Reset to defaults</button></div>
    <h3 style={{ marginTop: 18 }}>Users with extra permissions</h3>
    <Table rows={data.users.filter(u => (u.visitCaps || []).length)} empty="No user has extra permissions." cols={[['User', u => <b>{u.name}</b>], ['Role', u => (D.roles[u.role] || {}).label], ['Extra', u => u.visitCaps.map(k => <Chip key={k}>{CAP_SHORT[k]}</Chip>)], ['', u => <Btn onClick={() => userEdit(app, u.id)}>Edit</Btn>]]} />
  </>;
}

function ListsTab() {
  const app = useApp(), L = app.data.lists;
  const X = ({ k, v }) => <button type="button" title="Remove" aria-label={'Remove ' + v} onClick={() => listDel(app, k, v)}>×</button>;
  const Card = ({ title, k, hint, children }) => <div className="card" style={{ margin: 0 }}><h3>{title}</h3><p className="muted" style={{ marginTop: -6 }}>{hint}</p><div className="chips" style={{ marginBottom: 10 }}>{children}</div><Btn cls="pri" onClick={() => listAdd(app, k)}>+ Add</Btn></div>;
  return <>
    <div className="grid g2">
      <Card title="States / regions" k="states" hint="Used in branch, member and report filters.">{L.states.map(x => <span key={x} className="chip">{x}<X k="states" v={x} /></span>)}</Card>
      <Card title="Emergency-contact relations" k="rels" hint="Choices for a member’s emergency contact.">{L.rels.map(x => <span key={x} className="chip">{x}<X k="rels" v={x} /></span>)}</Card>
      <Card title="Meeting offices (guest visits)" k="offices" hint="Offices a host can book for a guest meeting; the Main Office approves the booking.">{(L.offices || []).map(x => <span key={x} className="chip">{x}<X k="offices" v={x} /></span>)}</Card>
      <Card title="Duty shifts" k="shifts" hint="Shifts offered when assigning sewa.">{L.shifts.map(x => <span key={x.name} className="chip">{x.name} <small>{x.time || ''}</small>
        <button type="button" title="Edit timing" aria-label={'Edit ' + x.name} onClick={() => shiftEdit(app, x.name)}>✎</button><X k="shifts" v={x.name} /></span>)}</Card>
    </div>
    <p className="muted">Member types (Short-Term, Monthly, Long-Term) are fixed because the stay-expiry alerts and monthly/long-term screens depend on them. Departments, branches and buildings are managed on their own pages.</p>
  </>;
}

function AuditTab() {
  const { data } = useApp();
  return <><h3>Audit log (latest 200)</h3><Table rows={data.log} cols={[['When', l => fdt(l.at)], ['By', l => l.by], ['Action', l => l.text]]} /></>;
}
