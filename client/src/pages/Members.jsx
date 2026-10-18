import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Badge, Avatar, FInput, FSelect } from '../components/ui.jsx';
import { ageOf } from '@shared/dates.js';
import { TYPES } from '@shared/constants.js';
import { memberAdd, memberEdit, memberView, memberDelete } from '../modals/members.jsx';

export default function Members() {
  const app = useApp(), { D, me, ui } = app, f = ui.f;
  const q = (f['mem.q'] || '').toLowerCase(), br = f['mem.br'], st = f['mem.st'], ty = f['mem.ty'], rs = f['mem.rs'];
  const list = D.members().filter(m => (!q || (m.id + m.name + m.mobile).toLowerCase().includes(q)) && (!br || m.branchId === br) && (!st || m.state === st) && (!ty || m.type === ty) && (!rs || (rs === 'Resident') === (D.memberStatus(m) === 'Resident')))
    .sort((a, b) => b.id.localeCompare(a.id)); // newest members first
  const cols = [
    ['Member', m => <div className="who"><Avatar m={m} /><div><b>{m.name}</b><br /><small>{m.id}</small></div></div>], ['Mobile', m => m.mobile], ['Age / Gender', m => `${ageOf(m.dob)} · ${m.gender}`],
    ['Branch', m => <>{D.bName(m.branchId)}<br /><small>{m.state}</small></>], ['Type', m => <Badge s={m.type} />], ['Status', m => D.memberStatus(m) ? <Badge s={D.memberStatus(m)} /> : '—'],
    ['', m => <><Btn onClick={() => memberView(app, m.id)}>View</Btn>{D.canEditMember(m) ? <><Btn onClick={() => memberEdit(app, m.id)}>Edit</Btn><Btn cls="dng" onClick={() => memberDelete(app, m.id)}>Delete</Btn></> : null}</>]];
  return <>
    <PageHead title="Member Master" sub="One permanent Member ID per person. Visits, sewa and stays all link to this ID.">{D.canEdit('members') ? <PBtn onClick={() => memberAdd(app)}>+ Add member</PBtn> : null}</PageHead>
    <div className="card">
      <div className="filters"><FInput k="mem.q" ph="Search ID, name, mobile…" />{me.role === 'coordinator' ? null : <FSelect k="mem.br" opts={D.branchOpts()} all="All branches" />}<FSelect k="mem.st" opts={D.STATES} all="All states" /><FSelect k="mem.ty" opts={TYPES} all="All types" /><FSelect k="mem.rs" opts={['Resident', 'Not resident']} all="Any residence" /></div>
      <div className="muted" style={{ marginBottom: 6 }}>{list.length} member(s){list.length > 100 ? ' — showing first 100' : ''}</div>
      <Table cols={cols} rows={list.slice(0, 100)} />
    </div>
  </>;
}
