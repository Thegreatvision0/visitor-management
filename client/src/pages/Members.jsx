import { useState } from 'react';
import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Badge, Avatar, FInput, FSelect, SavedFilters, RowMenu, Mobile } from '../components/ui.jsx';
import { confirm } from '../components/Modal.jsx';
import { ageOf, fdt } from '@shared/dates.js';
import { TYPES, LIVE } from '@shared/constants.js';
import { memberAdd, memberEdit, memberView, memberDelete, memberRestore, memberPurge } from '../modals/members.jsx';

const RES = ['Resident', 'Not arrived', 'Departed'];
export const RES_CLS = { Resident: 'ok', 'Not arrived': 'warn', Departed: 'gray' };
const FKEYS = ['mem.q', 'mem.st', 'mem.br', 'mem.ty', 'mem.rs'];

export default function Members() {
  const app = useApp(), { D, me, ui, setF, setFs } = app, f = ui.f;
  const [sel, setSel] = useState(() => new Set());
  const arch = f['mem.view'] === 'archived';
  const q = (f['mem.q'] || '').toLowerCase(), br = f['mem.br'], st = f['mem.st'], ty = f['mem.ty'], rs = f['mem.rs'];
  /* branch filter offers only the branches of the chosen state */
  const brOpts = D.branchOpts().filter(o => !st || o.state === st);
  const pool = arch ? D.archivedMembers() : D.members();
  const list = pool.filter(m => (!q || (m.id + m.name + m.mobile).toLowerCase().includes(q)) && (!br || m.branchId === br) && (!st || m.state === st) && (!ty || m.type === ty) && (!rs || D.residency(m) === rs))
    .sort((a, b) => b.id.localeCompare(a.id)); // newest members first
  const resB = m => { const s = D.residency(m); return <Badge s={s} cls={RES_CLS[s]} />; };
  const cols = [
    ['Member', m => <div className="who"><Avatar m={m} /><div><b className={D.residency(m) === 'Resident' ? 'res' : 'nonres'}>{m.name}</b><br /><small>{m.id}</small></div></div>, { sort: m => m.name, csv: m => m.name }],
    ['Member ID', m => m.id, { sort: m => m.id, hide: true }],
    ['Mobile', m => <Mobile m={m} />, { sort: m => m.mobile, csv: m => m.mobile }], ['Age / Gender', m => `${ageOf(m.dob)} · ${m.gender}`, { sort: m => -new Date(m.dob), csv: m => `${ageOf(m.dob)} · ${m.gender}` }],
    ['Branch', m => <>{D.bName(m.branchId)}<br /><small>{m.state}</small></>, { sort: m => D.bName(m.branchId), csv: m => D.bName(m.branchId) }],
    ['State', m => m.state, { sort: m => m.state, hide: true }], ['District', m => m.district, { sort: m => m.district, hide: true }],
    ['Type', m => <Badge s={m.type} />, { sort: m => m.type, csv: m => m.type }],
    arch ? ['Archived', m => <>{fdt(m.archived.on)}<br /><small>by {m.archived.by}{m.archived.reason ? ' — ' + m.archived.reason : ''}</small></>, { sort: m => m.archived.on, csv: m => m.archived.on }]
      : ['Status', resB, { sort: m => RES.indexOf(D.residency(m)), csv: m => D.residency(m) }],
    ['', m => arch
      ? <span className="rowacts"><Btn onClick={() => memberView(app, m.id)}>View</Btn>{D.canEditMember(m) ? <Btn cls="ok" onClick={() => memberRestore(app, m.id)}>Restore</Btn> : null}
          <RowMenu items={[me.role === 'superadmin' && !D.hasStayed(m.id) && { label: 'Delete permanently…', danger: true, on: () => memberPurge(app, m.id) }]} /></span>
      : <span className="rowacts"><Btn onClick={() => memberView(app, m.id)}>View</Btn>{D.canEditMember(m) ? <><Btn onClick={() => memberEdit(app, m.id)}>Edit</Btn>
          <RowMenu items={[{ label: 'Archive member…', danger: true, on: () => memberDelete(app, m.id) }]} /></> : null}</span>]];
  /* bulk: archive the ticked members (those with a live request are skipped and reported) */
  const bulkArchive = () => {
    const ms = [...sel].map(D.member).filter(m => m && D.canEditMember(m));
    const live = ms.filter(m => app.data.regs.some(r => r.memberId === m.id && LIVE.includes(r.status))), ok = ms.filter(m => !live.includes(m));
    confirm(app, 'Archive members', <>Archive <b>{ok.length}</b> member(s)? Their IDs and history are kept and they can be restored from <b>Archived</b>.{live.length ? <><br />Skipped (live request): {live.map(m => m.name).join(', ')}</> : null}</>, 'Archive', async () => {
      let n = 0; for (const m of ok) { try { await app.api.del('/members/' + m.id); n++; } catch { /* reported below */ } }
      await app.reload(); setSel(new Set()); app.toast(`${n} member(s) archived`, n === ok.length ? 'ok' : 'bad');
    }, true);
  };
  return <>
    <PageHead title="Member Master" sub="One permanent Member ID per person. Visits, sewa and stays all link to this ID.">{D.canEdit('members') ? <PBtn onClick={() => memberAdd(app)}>+ Add member</PBtn> : null}</PageHead>
    <div className="card">
      <div className="fchips">
        <button type="button" className={'fchip' + (arch ? '' : ' on')} aria-pressed={!arch} onClick={() => { setF('mem.view', ''); setSel(new Set()); }}>Active <b>{D.members().length}</b></button>
        <button type="button" className={'fchip' + (arch ? ' on' : '')} aria-pressed={arch} onClick={() => { setF('mem.view', 'archived'); setSel(new Set()); }}>Archived <b>{D.archivedMembers().length}</b></button>
      </div>
      <div className="filters">
        <FInput k="mem.q" ph="Search ID, name, mobile…" />
        <FSelect k="mem.st" opts={D.STATES} all="All states" onPick={v => { const b = D.branch(br); if (v && b && b.state !== v) setFs({ 'mem.br': '' }); }} />
        {me.role === 'coordinator' ? null : <FSelect k="mem.br" opts={brOpts} all={st ? `All branches in ${st}` : 'All branches'} />}
        <FSelect k="mem.ty" opts={TYPES} all="All types" />
        {arch ? null : <FSelect k="mem.rs" opts={RES} all="Any status" />}
        <SavedFilters page="members" keys={FKEYS} />
      </div>
      <div className="muted" style={{ marginBottom: 6 }}>{list.length} member(s){arch ? ' archived — search by ID finds them too' : ''}</div>
      <Table id="members" csv={arch ? 'archived-members' : 'members'} cols={cols} rows={list} empty={arch ? 'No archived members.' : 'No members match the filters.'}
        select={!arch && D.canEdit('members') ? { sel, set: setSel } : null} bulk={<Btn cls="dng" onClick={bulkArchive}>Archive selected</Btn>} />
    </div>
  </>;
}
