import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Badge, AttPct } from '../components/ui.jsx';
import { fd, today, diffDays } from '@shared/dates.js';
import { stayStart, stayEnd, stayType, pendingExt } from '@shared/constants.js';
import { regView, regNewLT, extReq, rcOut } from '../modals/regs.jsx';
import { bedExtend, bedTransfer } from '../modals/beds.jsx';
import { dutyAssign, dutyChange } from '../modals/duties.jsx';

export default function LongTerm() {
  const app = useApp(), { D, ui, setF } = app, t = today(), ed = D.canEdit('longterm');
  const L = D.regs().filter(r => ['Monthly', 'Long-Term'].includes(stayType(r)) && ['Approved', 'Checked In'].includes(r.status)).sort((a, c) => stayEnd(a).localeCompare(stayEnd(c)));
  const od = L.filter(r => r.status === 'Checked In' && stayEnd(r) < t), soon = L.filter(r => r.status === 'Checked In' && diffDays(t, stayEnd(r)) >= 0 && diffDays(t, stayEnd(r)) <= 7);
  /* filter chips — the dashboard and notifications open this page on "Overdue" or "Expiring within 7 days" */
  const fl = ui.f['lt.f'] || '', rows = fl === 'od' ? od : fl === 'soon' ? soon : L;
  const left = r => { const n = diffDays(t, stayEnd(r)); return n < 0 ? <span className="b bad">{-n}d overdue</span> : n <= 7 ? <span className="b warn">{n}d left</span> : `${n}d`; };
  /* one colour per action: view (neutral), extend (green), transfer (blue), sewa (purple), check out (red outline) */
  const acts = r => <span className="rowacts">
    <Btn cls="a-view" onClick={() => regView(app, r.id)}>View</Btn>
    {D.canEdit('accommodation') || D.canEdit('approvals') ? <Btn cls="a-ext" onClick={() => bedExtend(app, r.id)}>Extend</Btn> : ed && !pendingExt(r) ? <Btn cls="a-ext" onClick={() => extReq(app, r.id)}>Request ext.</Btn> : null}
    {D.canEdit('accommodation') && D.activeAlloc(r.id) ? <Btn cls="a-move" onClick={() => bedTransfer(app, r.id)}>Transfer</Btn> : null}
    {D.canEdit('departments') && r.status === 'Checked In' ? (D.activeDuty(r.id) ? <Btn cls="a-sewa" onClick={() => dutyChange(app, r.id)}>Change sewa</Btn> : <Btn cls="a-sewa" onClick={() => dutyAssign(app, r.id)}>Assign sewa</Btn>) : null}
    {D.canEdit('reception') && r.status === 'Checked In' ? <Btn cls="a-out" onClick={() => rcOut(app, r.id)}>Check out</Btn> : null}
  </span>;
  const chip = (k, l, n, cls) => <button type="button" className={'fchip' + (fl === k ? ' on' : '') + (cls ? ' ' + cls : '')} aria-pressed={fl === k} onClick={() => setF('lt.f', k)}>{l} <b>{n}</b></button>;
  return <>
    <PageHead title="Monthly & Long-Term Sewadar" sub="Approved stay period, accommodation, duties, attendance, extensions and departures.">{D.canEdit('prereg') ? <PBtn onClick={() => regNewLT(app)}>+ Register monthly / long-term</PBtn> : null}</PageHead>
    {od.length ? <div className="alert bad"><span><b>{od.length}</b> stay(s) have passed the approved end date: {od.map(r => D.mName(r.memberId)).join(', ')}</span></div> : null}
    {soon.length ? <div className="alert"><span><b>{soon.length}</b> stay(s) expiring within 7 days: {soon.map(r => D.mName(r.memberId) + ' (' + diffDays(t, stayEnd(r)) + 'd)').join(', ')}</span></div> : null}
    <div className="card">
      <div className="fchips">{chip('', 'All', L.length)}{chip('od', 'Overdue', od.length, 'bad')}{chip('soon', 'Expiring within 7 days', soon.length, 'warn')}</div>
      <Table rows={rows} id="longterm" csv="monthly-long-term" empty={fl ? 'No stays in this group.' : 'No monthly or long-term sewadar right now.'} cols={[
        ['Member', r => <><b>{D.mName(r.memberId)}</b><br /><small>{r.memberId} · {D.bName(r.branchId)}</small></>, { sort: r => D.mName(r.memberId), csv: r => `${D.mName(r.memberId)} (${r.memberId})` }],
        ['Type', r => <Badge s={stayType(r)} />, { sort: stayType }], ['Approved stay', r => `${fd(stayStart(r))} – ${fd(stayEnd(r))}`, { sort: stayEnd, csv: r => `${stayStart(r)} – ${stayEnd(r)}` }], ['Time left', left, { sort: r => diffDays(t, stayEnd(r)) }],
        ['Accommodation', r => { const a = D.activeAlloc(r.id); return a ? D.bedShort(D.bedO(a.bedId)) : <small>Not allocated</small>; }, { sort: r => { const a = D.activeAlloc(r.id); return a ? D.bedShort(D.bedO(a.bedId)) : ''; } }],
        ['Sewa', r => { const d = D.activeDuty(r.id); return d ? <>{D.dName(d.deptId)}<br /><small>{d.shift}</small></> : <small>Unassigned</small>; }, { sort: r => { const d = D.activeDuty(r.id); return d ? D.dName(d.deptId) : ''; } }],
        ['Attendance', r => <AttPct pct={D.attPct(r.id)} />, { sort: r => D.attPct(r.id) == null ? -1 : D.attPct(r.id) }], ['Extension', r => pendingExt(r) ? <Badge s="Pending" /> : '—'], ['', acts]]} />
    </div>
  </>;
}
