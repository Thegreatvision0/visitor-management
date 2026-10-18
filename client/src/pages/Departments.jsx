import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Badge, Tabs, useTab, FInput, FSelect } from '../components/ui.jsx';
import { fd, today } from '@shared/dates.js';
import { ATT } from '@shared/constants.js';
import { memberView } from '../modals/members.jsx';
import { dutyAssign, dutyChange, dutyExtend, dutyEnd, dutyDelete, deptAdd, deptEdit, deptDelete, setAtt, attAll } from '../modals/duties.jsx';

export default function Departments() {
  const app = useApp(), { D, me, data, ui, setF, setFs, setTab } = app, f = ui.f;
  /* overview tiles open that department's data */
  const openDept = (id, t) => { setFs(t === 'a' ? { 'du.dp': id, 'du.q': '', 'du.sh': '' } : { 'at.dp': id }); setTab('departments', t); };
  const who = d => <><button type="button" className="btn sm" style={{ border: 0, padding: 0, background: 'none', fontWeight: 700 }} onClick={() => memberView(app, d.memberId)}>{D.mName(d.memberId)}</button><br /><small>{d.memberId}</small></>;
  const tab = useTab('departments', 'o'), t = today(), R = D.regs(), sup = me.role === 'supervisor';
  const res = R.filter(r => r.status === 'Checked In' || r.status === 'Approved'), un = res.filter(r => !D.activeDuty(r.id));
  const mine = d => !sup || d.deptId === me.deptId;
  const manage = D.canEdit('departments') && !sup;
  let b = null;
  if (tab === 'o') b = <div className="grid g4">{data.depts.filter(x => !sup || x.id === me.deptId).map(x => (
    <div key={x.id} className="stat click" role="button" tabIndex={0} title="Open assignments" onClick={() => openDept(x.id, 'a')} onKeyDown={e => { if (e.key === 'Enter') openDept(x.id, 'a'); }}><div className="l">{x.name}{x.active ? '' : ' (inactive)'}</div><div className="v">{data.duties.filter(u => u.deptId === x.id && u.status === 'Active').length}</div><div className="s">Supervisor: {x.supervisor}</div>
      <div className="s" onClick={e => e.stopPropagation()}><a href="#" onClick={e => { e.preventDefault(); openDept(x.id, 'a'); }}>Assignments →</a> · <a href="#" onClick={e => { e.preventDefault(); openDept(x.id, 't'); }}>Attendance →</a></div>
      {manage ? <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}><Btn onClick={() => deptEdit(app, x.id)}>Edit</Btn> <Btn cls="dng" onClick={() => deptDelete(app, x.id)}>Delete</Btn></div> : null}</div>))}</div>;
  if (tab === 'a') {
    const q = (f['du.q'] || '').toLowerCase(), dp = f['du.dp'], sh = f['du.sh'];
    const L = data.duties.filter(d => d.status === 'Active' && D.reg(d.regId) && mine(d) && (!dp || d.deptId === dp) && (!sh || d.shift === sh) && (!q || (D.mName(d.memberId) + d.memberId).toLowerCase().includes(q)));
    b = <>
      {un.length && !sup ? <><div className="alert info"><span><b>{un.length}</b> member(s) without a sewa assignment: {un.slice(0, 4).map(r => D.mName(r.memberId)).join(', ')}{un.length > 4 ? '…' : ''}</span></div>
        {D.canEdit('departments') ? <div style={{ marginBottom: 10 }} className="acts">{un.map(r => <Btn key={r.id} cls="pri" onClick={() => dutyAssign(app, r.id)}>Assign: {D.mName(r.memberId)}</Btn>)}</div> : null}</> : null}
      <div className="filters"><FInput k="du.q" ph="Search member…" /><FSelect k="du.dp" opts={D.deptOpts()} all="All departments" /><FSelect k="du.sh" opts={D.SHIFTS} all="All shifts" /></div>
      <Table rows={L} empty="No active assignments." cols={[['Member', who], ['Department', d => D.dName(d.deptId)], ['Supervisor', d => d.supervisor], ['Shift', d => D.shiftLbl(d.shift)],
        ['Duty period', d => <>{fd(d.from)} – {fd(d.to)}{d.to < t ? <> <span className="b bad">ended {fd(d.to)}</span></> : null}</>], ['Status', d => <Badge s={d.status} />], ['', d => D.canDept(d.deptId) ? <><Btn onClick={() => dutyChange(app, d.regId)}>Change</Btn><Btn cls={d.to < t ? 'pri' : ''} onClick={() => dutyExtend(app, d.regId)}>Extend</Btn><Btn onClick={() => dutyEnd(app, d.regId)}>End</Btn></> : null]]} />
    </>;
  }
  if (tab === 't') {
    const date = f['at.date'] || t, adp = f['at.dp'] || '';
    const L = data.duties.filter(d => d.from <= date && date <= d.to && D.onSite(D.reg(d.regId), date) && (!adp || d.deptId === adp) && mine(d));
    const seen = {}, rows = L.filter(d => { if (seen[d.regId]) return false; seen[d.regId] = 1; return D.dutyOn(d.regId, date) === d; });
    const editable = d => D.canDept(d.deptId) && date <= t;
    b = <>
      <div className="filters"><input type="date" className="in" value={date} max={t} onChange={e => setF('at.date', e.target.value)} /><FSelect k="at.dp" opts={D.deptOpts()} all="All departments" />
        {rows.some(d => D.canDept(d.deptId)) && date <= t ? <Btn onClick={() => attAll(app, date, adp)}>Mark all Present</Btn> : null}</div>
      <Table rows={rows} empty="Nobody on duty for this date." cols={[['Member', who], ['Department', d => D.dName(d.deptId)], ['Shift', d => d.shift],
        ['Attendance', d => editable(d) ? <select className="in" value={D.attStatus(date, d.regId)} onChange={e => setAtt(app, date, d.regId, e.target.value)}>{ATT.map(a => <option key={a}>{a}</option>)}</select> : <Badge s={D.attStatus(date, d.regId)} />]]} />
    </>;
  }
  if (tab === 'h') b = <Table rows={data.duties.filter(d => D.reg(d.regId) && mine(d)).sort((a, c) => c.from.localeCompare(a.from)).slice(0, 120)} empty="No history." cols={[
    ['Member', d => D.mName(d.memberId)], ['Department', d => D.dName(d.deptId)], ['Shift', d => d.shift], ['Supervisor', d => d.supervisor], ['From', d => fd(d.from)], ['To', d => fd(d.to)], ['Status', d => <Badge s={d.status} />],
    ['', d => D.canDept(d.deptId) ? <Btn cls="dng" onClick={() => dutyDelete(app, d.id)}>Delete</Btn> : null]]} />;
  return <>
    <PageHead title="Sewa Department Management" sub="Assign sewadar to departments and shifts, record attendance, and keep full duty history.">{manage ? <PBtn onClick={() => deptAdd(app)}>+ Add department</PBtn> : null}</PageHead>
    <div className="card"><Tabs page="departments" list={[['o', 'Overview'], ['a', 'Assignments', data.duties.filter(d => d.status === 'Active' && D.reg(d.regId)).length], ['t', 'Attendance'], ['h', 'Duty history']]} />{b}</div>
  </>;
}
