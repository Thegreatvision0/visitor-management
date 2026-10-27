import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Badge, FInput, FSelect, RowMenu } from '../components/ui.jsx';
import { archiveAsk } from '../components/Modal.jsx';
import { fd, fdt, relTime } from '@shared/dates.js';
import { REG_STATUSES, pendingExt } from '@shared/constants.js';
import { regNew, regEdit, regView, regSubmit, regDelete, regWithdraw, regCancel, regReopen, extReq } from '../modals/regs.jsx';

export default function PreReg() {
  const app = useApp(), { D, me, ui } = app;
  const q = (ui.f['pr.q'] || '').toLowerCase(), st = ui.f['pr.st'], br = ui.f['pr.br'];
  const list = D.regs().filter(r => (!st || r.status === st) && (!br || r.branchId === br) && (!q || (r.id + D.mName(r.memberId) + r.memberId).toLowerCase().includes(q))).sort((a, b) => D.lastActivity(b).localeCompare(D.lastActivity(a)) || b.id.localeCompare(a.id)); // latest activity first
  const ed = D.canEdit('prereg');
  /* everyday actions as buttons; cancelling, archiving and deleting in the "⋯" menu */
  const acts = r => {
    const v = <Btn onClick={() => regView(app, r.id)}>View</Btn>;
    if (!ed) return v;
    const arch = app.feature('archive') && (['Draft', 'Rejected', 'Cancelled'].includes(r.status) || (r.status === 'Checked Out' && D.isMgmt))
      && { label: 'Archive request…', on: () => archiveAsk(app, { title: `Archive ${r.id} — ${D.mName(r.memberId)}`, note: 'It stays in the member’s visit history.', path: `/regs/${r.id}/archive`, done: `${r.id} archived` }) };
    const del = (['Draft', 'Rejected', 'Cancelled'].includes(r.status) || (r.status === 'Checked Out' && D.isMgmt)) && { label: 'Delete request…', danger: true, on: () => regDelete(app, r.id) };
    const cancel = ['Submitted', 'Approved'].includes(r.status) && { label: 'Cancel request…', danger: true, on: () => regCancel(app, r.id) };
    return <span className="rowacts">{v}
      {r.status === 'Draft' ? <><Btn onClick={() => regEdit(app, r.id)}>Edit</Btn><Btn cls="ok" onClick={() => regSubmit(app, r.id)}>Submit</Btn></> : null}
      {r.status === 'Submitted' ? <Btn onClick={() => regWithdraw(app, r.id)}>Withdraw</Btn> : null}
      {['Approved', 'Checked In'].includes(r.status) && !pendingExt(r) ? <Btn onClick={() => extReq(app, r.id)}>Request extension</Btn> : null}
      {['Rejected', 'Cancelled'].includes(r.status) ? <Btn onClick={() => regReopen(app, r.id)}>Re-open</Btn> : null}
      <RowMenu items={[cancel, arch, del]} />
    </span>;
  };
  const archView = ui.f['pr.view'] === 'archived', AR = D.archivedRegs().filter(r => (!q || (r.id + D.mName(r.memberId) + r.memberId).toLowerCase().includes(q)));
  return <>
    <PageHead title="Sewadar Pre-Registration" sub="Branch coordinators register sewadar before arrival and submit to Nurmahal management for approval.">{ed ? <PBtn onClick={() => regNew(app)}>+ New pre-registration</PBtn> : null}</PageHead>
    <div className="card">
      {app.feature('archive') ? <div className="fchips"><button type="button" className={'fchip' + (archView ? '' : ' on')} aria-pressed={!archView} onClick={() => app.setF('pr.view', '')}>Requests <b>{D.regs().length}</b></button>
        <button type="button" className={'fchip' + (archView ? ' on' : '')} aria-pressed={archView} onClick={() => app.setF('pr.view', 'archived')}>Archived <b>{D.archivedRegs().length}</b></button></div> : null}
      <div className="filters"><FInput k="pr.q" ph="Search request, member…" /><FSelect k="pr.st" opts={REG_STATUSES} all="All statuses" />{me.role === 'coordinator' ? null : <FSelect k="pr.br" opts={D.branchOpts()} all="All branches" />}</div>
      {archView ? <Table rows={AR} empty="No archived requests." cols={[['Request', r => <b>{r.id}</b>], ['Member', r => <>{D.mName(r.memberId)}<br /><small>{r.memberId}</small></>], ['Status', r => <Badge s={r.status} />],
        ['Archived', r => <>{fdt(r.archived.on)}<br /><small>by {r.archived.by}{r.archived.reason ? ' — ' + r.archived.reason : ''}</small></>],
        ['', r => <span className="rowacts"><Btn onClick={() => regView(app, r.id)}>View</Btn>{ed ? <Btn cls="ok" onClick={() => app.run(() => app.api.post(`/regs/${r.id}/restore`), `${r.id} restored`)}>Restore</Btn> : null}</span>]]} /> :
      <Table rows={list} cols={[['Last update', r => relTime(D.lastActivity(r))], ['Request', r => <><b>{r.id}</b>{r.source === 'Walk-in' ? <><br /><small>Walk-in</small></> : null}</>], ['Member', r => <>{D.mName(r.memberId)}<br /><small>{r.memberId}</small></>], ['Branch', r => D.bName(r.branchId)],
        ['Requested stay', r => `${fd(r.arrival)} – ${fd(r.departure)}`], ['Type', r => <Badge s={r.type} />], ['Pref. dept', r => D.dName(r.prefDept)],
        ['Status', r => <><Badge s={r.status} />{r.status === 'Rejected' && r.remarks ? <><br /><small>{r.remarks}</small></> : null}</>], ['', acts]]} />}
    </div>
  </>;
}
