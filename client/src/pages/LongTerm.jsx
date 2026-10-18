import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Badge } from '../components/ui.jsx';
import { fd, today, diffDays } from '@shared/dates.js';
import { stayStart, stayEnd, stayType, pendingExt } from '@shared/constants.js';
import { regView, regNewLT, extReq, rcOut } from '../modals/regs.jsx';
import { bedExtend, bedTransfer } from '../modals/beds.jsx';
import { dutyAssign, dutyChange } from '../modals/duties.jsx';

export default function LongTerm() {
  const app = useApp(), { D } = app, t = today(), ed = D.canEdit('longterm');
  const L = D.regs().filter(r => ['Monthly', 'Long-Term'].includes(stayType(r)) && ['Approved', 'Checked In'].includes(r.status)).sort((a, c) => stayEnd(a).localeCompare(stayEnd(c)));
  const od = L.filter(r => r.status === 'Checked In' && stayEnd(r) < t), soon = L.filter(r => r.status === 'Checked In' && diffDays(t, stayEnd(r)) >= 0 && diffDays(t, stayEnd(r)) <= 7);
  const left = r => { const n = diffDays(t, stayEnd(r)); return n < 0 ? <span className="b bad">{-n}d overdue</span> : n <= 7 ? <span className="b warn">{n}d left</span> : `${n}d`; };
  const acts = r => <>
    <Btn onClick={() => regView(app, r.id)}>View</Btn>
    {D.canEdit('accommodation') || D.canEdit('approvals') ? <Btn cls={stayEnd(r) < t ? 'ok' : ''} onClick={() => bedExtend(app, r.id)}>Extend</Btn> : ed && !pendingExt(r) ? <Btn onClick={() => extReq(app, r.id)}>Request ext.</Btn> : null}
    {D.canEdit('accommodation') && D.activeAlloc(r.id) ? <Btn onClick={() => bedTransfer(app, r.id)}>Transfer</Btn> : null}
    {D.canEdit('departments') && r.status === 'Checked In' ? (D.activeDuty(r.id) ? <Btn onClick={() => dutyChange(app, r.id)}>Change sewa</Btn> : <Btn onClick={() => dutyAssign(app, r.id)}>Assign sewa</Btn>) : null}
    {D.canEdit('reception') && r.status === 'Checked In' ? <Btn onClick={() => rcOut(app, r.id)}>Check out</Btn> : null}
  </>;
  return <>
    <PageHead title="Monthly & Long-Term Sewadar" sub="Approved stay period, accommodation, duties, attendance, extensions and departures.">{D.canEdit('prereg') ? <PBtn onClick={() => regNewLT(app)}>+ Register monthly / long-term</PBtn> : null}</PageHead>
    {od.length ? <div className="alert bad"><span><b>{od.length}</b> stay(s) have passed the approved end date: {od.map(r => D.mName(r.memberId)).join(', ')}</span></div> : null}
    {soon.length ? <div className="alert"><span><b>{soon.length}</b> stay(s) expiring within 7 days: {soon.map(r => D.mName(r.memberId) + ' (' + diffDays(t, stayEnd(r)) + 'd)').join(', ')}</span></div> : null}
    <div className="card"><Table rows={L} empty="No monthly or long-term sewadar right now." cols={[
      ['Member', r => <><b>{D.mName(r.memberId)}</b><br /><small>{r.memberId} · {D.bName(r.branchId)}</small></>], ['Type', r => <Badge s={stayType(r)} />], ['Approved stay', r => `${fd(stayStart(r))} – ${fd(stayEnd(r))}`], ['Time left', left],
      ['Accommodation', r => { const a = D.activeAlloc(r.id); return a ? D.bedShort(D.bedO(a.bedId)) : <small>Not allocated</small>; }],
      ['Sewa', r => { const d = D.activeDuty(r.id); return d ? <>{D.dName(d.deptId)}<br /><small>{d.shift}</small></> : <small>Unassigned</small>; }],
      ['Attendance', r => D.attPct(r.id) == null ? '—' : D.attPct(r.id) + '%'], ['Extension', r => pendingExt(r) ? <Badge s="Pending" /> : '—'], ['', acts]]} /></div>
  </>;
}
