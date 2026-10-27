import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, FInput, FSelect, Chip, RowMenu, Table } from '../components/ui.jsx';
import { archiveAsk } from '../components/Modal.jsx';
import { fdt } from '@shared/dates.js';
import { branchAdd, branchEdit, branchView, branchDelete } from '../modals/members.jsx';

/* Branches grouped by state; sub-branches are listed (indented) under their parent branch. */
export default function Branches() {
  const app = useApp(), { D, me, data, ui, toggle } = app;
  const isC = me.role === 'coordinator', ed = D.canEdit('branches');
  const q = (ui.f['br.q'] || '').toLowerCase(), st = ui.f['br.st'];
  const visible = data.branches.filter(b => D.inScope(b.id));
  const kids = id => visible.filter(b => b.parentId === id).sort((a, c) => a.name.localeCompare(c.name));
  const ids = new Set(visible.map(b => b.id));
  const roots = visible.filter(b => !b.parentId || !ids.has(b.parentId));
  /* search matches a branch or anything below it */
  const hit = b => !q || (b.name + b.district + b.coordinator).toLowerCase().includes(q) || kids(b.id).some(hit);
  const states = [...new Set(roots.map(b => b.state))].filter(s => !st || s === st).sort((a, c) => a === 'Punjab' ? -1 : c === 'Punjab' ? 1 : a.localeCompare(c));
  const P = data.branches.filter(b => b.state === 'Punjab').length;
  const count = (id, f) => data.regs.filter(r => r.branchId === id && f(r)).length;
  const canDel = b => ed && (!isC || b.id !== me.branchId);
  const rows = [];
  const add = (b, depth) => {
    if (!hit(b)) return;
    const subs = kids(b.id);
    rows.push(<tr key={b.id}>
      <td data-label="Branch" className="rt-title" style={{ paddingLeft: 10 + depth * 24 }}>{depth ? <span className="muted">└ </span> : null}<b>{b.name}</b>{subs.length ? <> <Chip>{subs.length} sub-branch{subs.length > 1 ? 'es' : ''}</Chip></> : null}{depth ? <><br /><small>Sub-branch of {D.branch(b.parentId).name}</small></> : null}</td>
      <td data-label="District">{b.district}</td><td data-label="Coordinator">{b.coordinator}<br /><small>{b.phone}</small></td>
      <td data-label="Members">{data.members.filter(m => m.branchId === b.id && !m.archived).length}</td><td data-label="Open requests">{count(b.id, r => ['Submitted', 'Approved'].includes(r.status))}</td><td data-label="Residing now">{count(b.id, r => r.status === 'Checked In')}</td>
      <td data-label=""><span className="rowacts"><Btn cls="a-view" onClick={() => branchView(app, b.id)}>View</Btn>{ed ? <><Btn cls="a-move" onClick={() => branchAdd(app, b.id)}>+ Sub-branch</Btn><Btn cls="a-edit" onClick={() => branchEdit(app, b.id)}>Edit</Btn></> : null}
        {canDel(b) ? <RowMenu items={[app.feature('archive') && { label: 'Archive branch…', on: () => archiveAsk(app, { title: `Archive branch — ${b.name}`, note: 'Its members and past requests stay linked to it.', path: `/branches/${b.id}/archive`, done: `${b.name} archived` }) },
          { label: 'Delete branch…', danger: true, on: () => branchDelete(app, b.id) }]} /> : null}</span></td>
    </tr>);
    subs.forEach(s => add(s, depth + 1));
  };
  states.forEach(s => {
    const list = roots.filter(b => b.state === s && hit(b)).sort((a, c) => a.name.localeCompare(c.name));
    if (!list.length) return;
    const k = 'st:' + s, n = visible.filter(b => b.state === s).length;
    rows.push(<tr key={k} className="rt-group"><td colSpan={7} style={{ background: 'var(--pri-l)' }}>
      <button type="button" className="tgl" onClick={() => toggle(k)} aria-label="Expand or collapse">{ui.closed[k] && !q ? '▸' : '▾'}</button><b>{s}</b> <span className="muted">· {n} branch{n > 1 ? 'es' : ''}</span></td></tr>);
    if (!ui.closed[k] || q) list.forEach(b => add(b, 0));
  });
  const arch = ui.f['br.view'] === 'archived', AB = D.archivedBranches().filter(b => D.inScope(b.id) || !isC);
  return <>
    <PageHead title="Branch Management" sub={<>{data.branches.length} branches — {P} in Punjab, {data.branches.length - P} in other states. Large branches can be divided into sub-branches.</>}>
      {ed && !isC ? <PBtn onClick={() => branchAdd(app)}>+ Add branch</PBtn> : null}
      {ed && isC ? <PBtn onClick={() => branchAdd(app, me.branchId)}>+ Add sub-branch</PBtn> : null}
    </PageHead>
    <div className="card">
      {app.feature('archive') ? <div className="fchips"><button type="button" className={'fchip' + (arch ? '' : ' on')} aria-pressed={!arch} onClick={() => app.setF('br.view', '')}>In use <b>{visible.length}</b></button>
        <button type="button" className={'fchip' + (arch ? ' on' : '')} aria-pressed={arch} onClick={() => app.setF('br.view', 'archived')}>Archived <b>{AB.length}</b></button></div> : null}
      {arch ? <Table rows={AB} empty="No archived branches." cols={[['Branch', b => <><b>{b.name}</b><br /><small>{b.state} · {b.district}</small></>], ['Archived', b => <>{fdt(b.archived.on)}<br /><small>by {b.archived.by}{b.archived.reason ? ' — ' + b.archived.reason : ''}</small></>],
        ['Members', b => data.members.filter(m => m.branchId === b.id && !m.archived).length], ['', b => ed ? <Btn cls="ok" onClick={() => app.run(() => app.api.post(`/branches/${b.id}/restore`), `${b.name} restored`)}>Restore</Btn> : null]]} /> : <>
      <div className="filters"><FInput k="br.q" ph="Search branch, district, coordinator…" /><FSelect k="br.st" opts={D.STATES} all="All states" /></div>
      {rows.length ? <div className="tw"><table className="rt">
        <thead><tr><th>State › Branch › Sub-branch</th><th>District</th><th>Coordinator</th><th>Members</th><th>Open requests</th><th>Residing now</th><th></th></tr></thead>
        <tbody>{rows}</tbody></table></div> : <div className="empty">No branches found.</div>}
      {data.branches.some(b => b.sample) ? <p className="muted"><Chip>Sample list — edit to match actual branches</Chip></p> : null}
      </>}
    </div>
  </>;
}
