import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, FInput, FSelect, Chip } from '../components/ui.jsx';
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
      <td data-label="Members">{data.members.filter(m => m.branchId === b.id).length}</td><td data-label="Open requests">{count(b.id, r => ['Submitted', 'Approved'].includes(r.status))}</td><td data-label="Residing now">{count(b.id, r => r.status === 'Checked In')}</td>
      <td data-label=""><Btn onClick={() => branchView(app, b.id)}>View</Btn>{ed ? <><Btn onClick={() => branchAdd(app, b.id)}>+ Sub-branch</Btn><Btn onClick={() => branchEdit(app, b.id)}>Edit</Btn></> : null}{canDel(b) ? <Btn cls="dng" onClick={() => branchDelete(app, b.id)}>Delete</Btn> : null}</td>
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
  return <>
    <PageHead title="Branch Management" sub={<>{data.branches.length} branches — {P} in Punjab, {data.branches.length - P} in other states. Large branches can be divided into sub-branches.</>}>
      {ed && !isC ? <PBtn onClick={() => branchAdd(app)}>+ Add branch</PBtn> : null}
      {ed && isC ? <PBtn onClick={() => branchAdd(app, me.branchId)}>+ Add sub-branch</PBtn> : null}
    </PageHead>
    <div className="card">
      <div className="filters"><FInput k="br.q" ph="Search branch, district, coordinator…" /><FSelect k="br.st" opts={D.STATES} all="All states" /></div>
      {rows.length ? <div className="tw"><table className="rt">
        <thead><tr><th>State › Branch › Sub-branch</th><th>District</th><th>Coordinator</th><th>Members</th><th>Open requests</th><th>Residing now</th><th></th></tr></thead>
        <tbody>{rows}</tbody></table></div> : <div className="empty">No branches found.</div>}
      {data.branches.some(b => b.sample) ? <p className="muted"><Chip>Sample list — edit to match actual branches</Chip></p> : null}
    </div>
  </>;
}
