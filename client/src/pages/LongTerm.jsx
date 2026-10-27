import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Badge, AttPct, RowMenu, StayBadge, stayStatus } from '../components/ui.jsx';
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
  /* the actions a row offers: [key, label, run, class] */
  const actions = r => [
    D.canEdit('accommodation') || D.canEdit('approvals') ? ['ext', 'Extend', () => bedExtend(app, r.id), 'a-ext'] : ed && !pendingExt(r) ? ['ext', 'Request ext.', () => extReq(app, r.id), 'a-ext'] : null,
    D.canEdit('accommodation') && D.activeAlloc(r.id) ? ['move', 'Transfer', () => bedTransfer(app, r.id), 'a-move'] : null,
    D.canEdit('departments') && r.status === 'Checked In' ? (D.activeDuty(r.id) ? ['sewa', 'Change sewa', () => dutyChange(app, r.id), 'a-sewa'] : ['sewa', 'Assign sewa', () => dutyAssign(app, r.id), 'a-sewa']) : null,
    D.canEdit('reception') && r.status === 'Checked In' ? ['out', 'Check out', () => rcOut(app, r.id), 'a-out'] : null
  ].filter(Boolean);
  /* one main action per row — what the stay needs next — and the rest in "⋯" */
  const mainKey = r => { const s = stayStatus(r, t); return s === 'Overdue' ? 'out' : r.status === 'Checked In' && !D.activeDuty(r.id) ? 'sewa' : diffDays(t, stayEnd(r)) <= 7 ? 'ext' : null; };
  const acts = r => {
    const list = actions(r);
    if (!app.feature('rowMenus')) return <span className="rowacts"><Btn cls="a-view" onClick={() => regView(app, r.id)}>View</Btn>{list.map(([k, l, run, cls]) => <Btn key={k} cls={cls} onClick={run}>{l}</Btn>)}</span>;
    const main = list.find(x => x[0] === mainKey(r)), rest = list.filter(x => x !== main);
    return <span className="rowacts">{main ? <Btn cls={main[3]} onClick={main[2]}>{main[1]}</Btn> : <Btn cls="a-view" onClick={() => regView(app, r.id)}>View</Btn>}
      <RowMenu items={[main ? { label: 'View', on: () => regView(app, r.id) } : null, ...rest.map(([k, l, run]) => ({ label: l, on: run, danger: k === 'out' }))]} /></span>;
  };
  const chip = (k, l, n, cls) => <button type="button" className={'fchip' + (fl === k ? ' on' : '') + (cls ? ' ' + cls : '')} aria-pressed={fl === k} onClick={() => setF('lt.f', k)}>{l} <b>{n}</b></button>;
  return <>
    <PageHead title="Monthly & Long-Term Sewadar" sub="Approved stay period, accommodation, duties, attendance, extensions and departures.">{D.canEdit('prereg') ? <PBtn onClick={() => regNewLT(app)}>+ Register monthly / long-term</PBtn> : null}</PageHead>
    {od.length ? <div className="alert bad"><span><b>{od.length}</b> stay(s) have passed the approved end date: {od.map(r => D.mName(r.memberId)).join(', ')}</span></div> : null}
    {soon.length ? <div className="alert"><span><b>{soon.length}</b> stay(s) expiring within 7 days: {soon.map(r => D.mName(r.memberId) + ' (' + diffDays(t, stayEnd(r)) + 'd)').join(', ')}</span></div> : null}
    <div className="card">
      <div className="fchips">{chip('', 'All', L.length)}{chip('od', 'Overdue', od.length, 'bad')}{chip('soon', 'Expiring within 7 days', soon.length, 'warn')}</div>
      <Table rows={rows} id="longterm" csv="monthly-long-term" empty={fl ? 'No stays in this group.' : 'No monthly or long-term sewadar right now.'} cols={[
        ['Member', r => <><b>{D.mName(r.memberId)}</b><br /><small>{r.memberId} · {D.bName(r.branchId)}</small></>, { sort: r => D.mName(r.memberId), csv: r => `${D.mName(r.memberId)} (${r.memberId})` }],
        app.feature('stayBadges') ? ['Status', r => <StayBadge r={r} />, { sort: r => stayStatus(r, t) }] : null,
        ['Type', r => <Badge s={stayType(r)} />, { sort: stayType }], ['Approved stay', r => `${fd(stayStart(r))} – ${fd(stayEnd(r))}`, { sort: stayEnd, csv: r => `${stayStart(r)} – ${stayEnd(r)}` }], ['Time left', left, { sort: r => diffDays(t, stayEnd(r)) }],
        ['Accommodation', r => { const a = D.activeAlloc(r.id); return a ? D.bedShort(D.bedO(a.bedId)) : <small>Not allocated</small>; }, { sort: r => { const a = D.activeAlloc(r.id); return a ? D.bedShort(D.bedO(a.bedId)) : ''; } }],
        ['Sewa', r => { const d = D.activeDuty(r.id); return d ? <>{D.dName(d.deptId)}<br /><small>{d.shift}</small></> : <small>Unassigned</small>; }, { sort: r => { const d = D.activeDuty(r.id); return d ? D.dName(d.deptId) : ''; } }],
        ['Attendance', r => <AttPct pct={D.attPct(r.id)} />, { sort: r => D.attPct(r.id) == null ? -1 : D.attPct(r.id) }], ['Extension', r => pendingExt(r) ? <Badge s="Pending" /> : '—'], ['', acts]].filter(Boolean)} />
    </div>
  </>;
}
