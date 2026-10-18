import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Badge, FInput, FSelect } from '../components/ui.jsx';
import { fd, relTime } from '@shared/dates.js';
import { REG_STATUSES, pendingExt } from '@shared/constants.js';
import { regNew, regEdit, regView, regSubmit, regDelete, regWithdraw, regCancel, regReopen, extReq } from '../modals/regs.jsx';

export default function PreReg() {
  const app = useApp(), { D, me, ui } = app;
  const q = (ui.f['pr.q'] || '').toLowerCase(), st = ui.f['pr.st'], br = ui.f['pr.br'];
  const list = D.regs().filter(r => (!st || r.status === st) && (!br || r.branchId === br) && (!q || (r.id + D.mName(r.memberId) + r.memberId).toLowerCase().includes(q))).sort((a, b) => D.lastActivity(b).localeCompare(D.lastActivity(a)) || b.id.localeCompare(a.id)); // latest activity first
  const ed = D.canEdit('prereg');
  const acts = r => {
    const v = <Btn onClick={() => regView(app, r.id)}>View</Btn>;
    if (!ed) return v;
    return <>{v}
      {r.status === 'Draft' ? <><Btn onClick={() => regEdit(app, r.id)}>Edit</Btn><Btn cls="ok" onClick={() => regSubmit(app, r.id)}>Submit</Btn><Btn cls="dng" onClick={() => regDelete(app, r.id)}>Delete</Btn></> : null}
      {r.status === 'Submitted' ? <><Btn onClick={() => regWithdraw(app, r.id)}>Withdraw</Btn><Btn cls="dng" onClick={() => regCancel(app, r.id)}>Cancel</Btn></> : null}
      {r.status === 'Approved' ? <>{pendingExt(r) ? null : <Btn onClick={() => extReq(app, r.id)}>Request extension</Btn>}<Btn cls="dng" onClick={() => regCancel(app, r.id)}>Cancel</Btn></> : null}
      {r.status === 'Checked In' && !pendingExt(r) ? <Btn onClick={() => extReq(app, r.id)}>Request extension</Btn> : null}
      {['Rejected', 'Cancelled'].includes(r.status) ? <><Btn onClick={() => regReopen(app, r.id)}>Re-open</Btn><Btn cls="dng" onClick={() => regDelete(app, r.id)}>Delete</Btn></> : null}
      {r.status === 'Checked Out' && D.isMgmt ? <Btn cls="dng" onClick={() => regDelete(app, r.id)}>Delete</Btn> : null}
    </>;
  };
  return <>
    <PageHead title="Sewadar Pre-Registration" sub="Branch coordinators register sewadar before arrival and submit to Nurmahal management for approval.">{ed ? <PBtn onClick={() => regNew(app)}>+ New pre-registration</PBtn> : null}</PageHead>
    <div className="card">
      <div className="filters"><FInput k="pr.q" ph="Search request, member…" /><FSelect k="pr.st" opts={REG_STATUSES} all="All statuses" />{me.role === 'coordinator' ? null : <FSelect k="pr.br" opts={D.branchOpts()} all="All branches" />}</div>
      <Table rows={list} cols={[['Last update', r => relTime(D.lastActivity(r))], ['Request', r => <><b>{r.id}</b>{r.source === 'Walk-in' ? <><br /><small>Walk-in</small></> : null}</>], ['Member', r => <>{D.mName(r.memberId)}<br /><small>{r.memberId}</small></>], ['Branch', r => D.bName(r.branchId)],
        ['Requested stay', r => `${fd(r.arrival)} – ${fd(r.departure)}`], ['Type', r => <Badge s={r.type} />], ['Pref. dept', r => D.dName(r.prefDept)],
        ['Status', r => <><Badge s={r.status} />{r.status === 'Rejected' && r.remarks ? <><br /><small>{r.remarks}</small></> : null}</>], ['', acts]]} />
    </div>
  </>;
}
