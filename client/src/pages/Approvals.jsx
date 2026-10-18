import { useApp } from '../context.jsx';
import { PageHead, Btn, Table, Badge, Tabs, useTab } from '../components/ui.jsx';
import { fd, diffDays, relTime } from '@shared/dates.js';
import { stayEnd, pendingExt } from '@shared/constants.js';
import { approveOpen, regView, extDecide, apRevert, apReconsider } from '../modals/regs.jsx';

const desc = f => (a, b) => String(f(b)).localeCompare(String(f(a))) || b.id.localeCompare(a.id);

export default function Approvals() {
  const app = useApp(), { D } = app, R = D.regs();
  /* newest first everywhere: latest request on top (Today, Yesterday, then older dates) */
  const subs = R.filter(r => r.status === 'Submitted').sort(desc(D.submittedAt)), ex = R.filter(r => pendingExt(r)).sort(desc(r => pendingExt(r).on));
  const tab = useTab('approvals', 'p'), ed = D.canEdit('approvals');
  const coord = r => (D.branch(r.branchId) || {}).coordinator;
  let b = null;
  if (tab === 'p') b = <Table rows={subs} empty="No requests waiting for approval." cols={[
    ['Received', r => <b>{relTime(D.submittedAt(r))}</b>],
    ['Request', r => <><b>{r.id}</b>{r.source === 'Walk-in' ? <><br /><small>Walk-in</small></> : null}</>], ['Member', r => <>{D.mName(r.memberId)}<br /><small>{r.memberId} · {D.bName(r.branchId)}</small></>],
    ['Requested', r => <>{fd(r.arrival)} – {fd(r.departure)}<br /><small>{diffDays(r.arrival, r.departure) + 1} day(s)</small></>], ['Type', r => <Badge s={r.type} />], ['Pref. dept', r => D.dName(r.prefDept)], ['Purpose', r => r.purpose],
    ['', r => ed ? <Btn cls="pri" onClick={() => approveOpen(app, r.id)}>Review</Btn> : <Btn onClick={() => regView(app, r.id)}>View</Btn>]]} />;
  if (tab === 'x') b = <Table rows={ex} empty="No extension requests." cols={[
    ['Received', r => <b>{relTime(pendingExt(r).on)}</b>],
    ['Member', r => <>{D.mName(r.memberId)}<br /><small>{r.memberId} · {r.id}</small></>],
    ['Branch', r => <>{D.bName(r.branchId)}<br /><small>Coordinator: {coord(r) || '—'}</small></>],
    ['Requested by', r => { const e = pendingExt(r); return <>{e.byName || e.by}{e.byName ? <><br /><small>{e.by}</small></> : null}</>; }],
    ['Current end', r => fd(stayEnd(r))], ['Requested end', r => <>{fd(pendingExt(r).to)}<br /><small>+{diffDays(stayEnd(r), pendingExt(r).to)} day(s)</small></>], ['Reason', r => pendingExt(r).reason],
    ['', r => ed ? <><Btn cls="ok" onClick={() => extDecide(app, r.id, true)}>Approve</Btn><Btn cls="bad" onClick={() => extDecide(app, r.id, false)}>Reject</Btn></> : null]]} />;
  if (tab === 'd') b = <Table rows={R.filter(r => ['Approved', 'Checked In', 'Checked Out', 'Rejected'].includes(r.status)).sort(desc(D.lastActivity)).slice(0, 60)} cols={[
    ['Last update', r => relTime(D.lastActivity(r))],
    ['Request', r => r.id], ['Member', r => <>{D.mName(r.memberId)}<br /><small>{D.bName(r.branchId)}</small></>], ['Decision', r => <Badge s={r.status === 'Rejected' ? 'Rejected' : 'Approved'} />], ['Approved stay', r => r.approvedFrom ? `${fd(r.approvedFrom)} – ${fd(r.approvedTo)}` : '—'], ['Remarks', r => r.remarks || ''],
    ['', r => <><Btn onClick={() => regView(app, r.id)}>View</Btn>{ed && r.status === 'Approved' ? <Btn onClick={() => apRevert(app, r.id)}>Revert to pending</Btn> : null}{ed && r.status === 'Rejected' ? <Btn onClick={() => apReconsider(app, r.id)}>Reconsider</Btn> : null}</>]]} />;
  return <>
    <PageHead title="Approval Management" sub="Review requests, confirm dates and type, assign sewa department, then forward to reception. Newest requests are listed first." />
    <div className="card"><Tabs page="approvals" list={[['p', 'Pending requests', subs.length], ['x', 'Extension requests', ex.length], ['d', 'Decided']]} />{b}</div>
  </>;
}
