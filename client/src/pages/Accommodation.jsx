import { useApp } from '../context.jsx';
import { PageHead, Btn, Table, Badge, Tabs, useTab, FInput, FSelect, Chip } from '../components/ui.jsx';
import { fd } from '@shared/dates.js';
import { stayStart, stayEnd, stayType } from '@shared/constants.js';
import { bedOpen, bedAssign, bedTransfer, bedExtend, bedRelease, bedClean, structAdd, structEdit, structDelete } from '../modals/beds.jsx';

const STATUSES = ['Available', 'Occupied', 'Reserved', 'Cleaning'];

export default function Accommodation() {
  const app = useApp(), { D, data, setTab, setF } = app;
  const tab = useTab('accommodation', 'b'), ed = D.canEdit('accommodation'), R = D.regs(), st = D.bedStates();
  const live = r => ['Approved', 'Checked In'].includes(r.status);
  const waiting = R.filter(r => live(r) && !D.activeAlloc(r.id)), res = R.filter(r => live(r) && D.activeAlloc(r.id)), clean = data.beds.filter(b => b.cleaning);
  const pathOf = r => D.bedPath(D.bedO(D.activeAlloc(r.id).bedId));
  let b = null;
  if (tab === 'b') {
    const c = { Available: 0, Occupied: 0, Reserved: 0, Cleaning: 0 }; st.forEach(s => c[s.status]++);
    b = <>
      <div className="legend">{STATUSES.map(k => <span key={k}><i className={'dot c-' + k} />{k} <b>{c[k]}</b></span>)}</div>
      <div className="filters">
        <FSelect k="acc.site" opts={data.sites.map(s => ({ v: s.id, l: s.name }))} all="All sites" onPick={() => setF('acc.bld', '')} />
        <FSelect k="acc.bld" opts={data.buildings.filter(x => !app.ui.f['acc.site'] || x.siteId === app.ui.f['acc.site']).map(x => ({ v: x.id, l: x.name }))} all="All buildings" />
        <FSelect k="acc.st" opts={STATUSES} all="All statuses" /><FInput k="acc.q" ph="Find resident…" />
      </div>
      <Board st={st} />
    </>;
  }
  if (tab === 'w') b = <Table rows={waiting} empty="Everyone approved has a bed." cols={[
    ['Member', r => <><b>{D.mName(r.memberId)}</b><br /><small>{r.memberId} · {(D.member(r.memberId) || {}).gender}</small></>], ['Stay', r => `${fd(stayStart(r))} – ${fd(stayEnd(r))}`], ['Status', r => <Badge s={r.status} />], ['Type', r => <Badge s={stayType(r)} />],
    ['', r => ed ? <Btn cls="pri" onClick={() => bedAssign(app, r.id)}>Assign bed</Btn> : null]]} />;
  if (tab === 'r') b = <Table rows={res.slice().sort((a, c) => pathOf(a).localeCompare(pathOf(c)))} empty="No allocations." cols={[
    ['Member', r => <><b>{D.mName(r.memberId)}</b><br /><small>{r.memberId}</small></>], ['Site › Building › Floor › Room › Bed', pathOf], ['Allocated', r => `${fd(D.activeAlloc(r.id).from)} – ${fd(D.activeAlloc(r.id).to)}`],
    ['Status', r => <Badge s={r.status === 'Checked In' ? 'Occupied' : 'Reserved'} />],
    ['', r => ed ? <><Btn onClick={() => bedTransfer(app, r.id)}>Transfer</Btn><Btn onClick={() => bedExtend(app, r.id)}>Extend</Btn><Btn onClick={() => bedRelease(app, r.id)}>Unassign bed</Btn></> : null]]} />;
  if (tab === 'c') b = <Table rows={clean} empty="No beds waiting for cleaning." cols={[['Bed', x => D.bedPath(x)], ['', x => ed ? <Btn cls="ok" onClick={() => bedClean(app, x.id)}>Mark cleaned</Btn> : null]]} />;
  if (tab === 's') b = <Structure ed={ed} />;
  return <>
    <PageHead title="Accommodation & Bed Management" sub="Site → Building → Floor → Room → Bed. A bed can never be assigned to two people for overlapping dates.">
      {ed ? <><button className="btn" onClick={() => structAdd(app, 'site')}>+ Add site</button><button className="btn pri" onClick={() => structAdd(app, 'building')}>+ Add building</button>
        {tab === 's' ? null : <button className="btn" onClick={() => setTab('accommodation', 's')}>Manage rooms &amp; beds</button>}</> : null}
    </PageHead>
    <div className="card"><Tabs page="accommodation" list={[['b', 'Bed board'], ['w', 'Awaiting bed', waiting.length], ['r', 'Resident register', res.length], ['c', 'Cleaning', clean.length], ['s', 'Structure']]} />{b}</div>
  </>;
}

function Board({ st }) {
  const app = useApp(), { D, data, ui } = app;
  const q = (ui.f['acc.q'] || '').toLowerCase(), fs = ui.f['acc.site'] || '', fb = ui.f['acc.bld'] || '', fst = ui.f['acc.st'] || '';
  const out = [];
  data.sites.filter(s => !fs || s.id === fs).forEach(s => data.buildings.filter(b => b.siteId === s.id && (!fb || b.id === fb)).forEach(b => {
    const floors = [];
    b.floors.forEach(fl => {
      const rooms = [];
      data.rooms.filter(r => r.buildingId === b.id && r.floor === fl).forEach(rm => {
        const beds = data.beds.filter(x => x.roomId === rm.id);
        const shown = beds.filter(x => { const s2 = st.get(x.id); return (!fst || s2.status === fst) && (!q || (s2.member && (s2.member.name + s2.member.id).toLowerCase().includes(q))); });
        if (!shown.length) return;
        const occ = beds.filter(x => st.get(x.id).status === 'Occupied').length;
        rooms.push(<div key={rm.id} className="room"><div className="rh"><b>{rm.name}</b><span className="muted">{rm.gender} · {occ}/{beds.length} occupied</span></div>
          <div className="beds">{shown.map(x => { const s2 = st.get(x.id); return <button key={x.id} type="button" className={'bed s-' + s2.status} title={s2.status} onClick={() => bedOpen(app, x.id)}><b>Bed {x.label}</b><small>{s2.member ? s2.member.name : s2.guest ? 'Guest: ' + s2.guest : s2.status}</small></button>; })}</div></div>);
      });
      if (rooms.length) floors.push(<div key={fl}><div className="fl">{fl} Floor</div><div className="rooms">{rooms}</div></div>);
    });
    if (floors.length) out.push(<div key={b.id}><h3 style={{ marginTop: 14 }}>{s.name} › {b.name}</h3>{floors}</div>);
  }));
  return out.length ? <>{out}</> : <div className="empty">No beds match the filters.</div>;
}

function Structure({ ed }) {
  const app = useApp(), { D, data, ui, toggle } = app, st = D.bedStates(), closed = ui.closed;
  const Tg = ({ k }) => <button type="button" className="tgl" onClick={() => toggle(k)} aria-label="Expand or collapse">{closed[k] ? '▸' : '▾'}</button>;
  const B = ({ label, cls, on }) => <Btn cls={cls} onClick={on}>{label}</Btn>;
  const bedsIn = rids => { const s = new Set(rids); return data.beds.filter(b => s.has(b.roomId)).map(b => b.id); };
  const Sum = ({ bids }) => {
    let o = 0, r = 0, c = 0;
    bids.forEach(id => { const x = st.get(id); if (!x) return; if (x.status === 'Occupied') o++; else if (x.status === 'Reserved') r++; else if (x.status === 'Cleaning') c++; });
    return <small className="muted">{bids.length} bed(s) · {bids.length - o - r - c} free · {o} occupied{r ? ` · ${r} reserved` : ''}{c ? ` · ${c} cleaning` : ''}</small>;
  };
  const BedChip = ({ x }) => {
    const s2 = st.get(x.id);
    return <span className={'bchip s-' + s2.status} title={s2.status + (s2.member ? ' — ' + s2.member.name : s2.guest ? ' — guest ' + s2.guest : '')}><b>{x.label}</b><small>{s2.member ? s2.member.name : s2.guest ? 'Guest: ' + s2.guest : s2.status}</small>
      {ed ? <><button type="button" title="Rename bed" aria-label={'Rename bed ' + x.label} onClick={() => structEdit(app, 'bed', x.id)}>✎</button><button type="button" title="Delete bed" aria-label={'Delete bed ' + x.label} onClick={() => structDelete(app, 'bed', x.id)}>×</button></> : null}</span>;
  };
  const Room = ({ rm }) => {
    const bs = data.beds.filter(x => x.roomId === rm.id);
    return <><div className="trow"><b>{rm.name}</b><Chip>Room · {rm.gender}</Chip><Sum bids={bs.map(x => x.id)} />
      {ed ? <span className="tacts"><B label="+ Bed" on={() => structAdd(app, 'bed', rm.id)} /><B label="Edit" on={() => structEdit(app, 'room', rm.id)} /><B label="Delete" cls="dng" on={() => structDelete(app, 'room', rm.id)} /></span> : null}</div>
      <div className="bchips">{bs.length ? bs.map(x => <BedChip key={x.id} x={x} />) : <span className="muted">No beds yet — use “+ Bed”.</span>}</div></>;
  };
  const Floor = ({ b, fl }) => {
    const fk = 'f:' + b.id + '|' + fl, fr = data.rooms.filter(r => r.buildingId === b.id && r.floor === fl);
    return <div className="tnode"><div className="trow"><Tg k={fk} /><b>{fl} Floor</b><Chip>Floor</Chip><Sum bids={bedsIn(fr.map(r => r.id))} />
      {ed ? <span className="tacts"><B label="+ Room" on={() => structAdd(app, 'room', b.id, fl)} /><B label="Rename" on={() => structEdit(app, 'floor', b.id, fl)} /><B label="Delete" cls="dng" on={() => structDelete(app, 'floor', b.id, fl)} /></span> : null}</div>
      {closed[fk] ? null : <div className="kids">{fr.length ? fr.map(rm => <Room key={rm.id} rm={rm} />) : <div className="muted" style={{ padding: '6px 8px' }}>No rooms on this floor yet — use “+ Room”.</div>}</div>}</div>;
  };
  const Bld = ({ b }) => {
    const bk = 'b:' + b.id, rms = data.rooms.filter(r => r.buildingId === b.id);
    return <div className="tnode"><div className="trow"><Tg k={bk} /><b>{b.name}</b><Chip>Building</Chip><Sum bids={bedsIn(rms.map(r => r.id))} />
      {ed ? <span className="tacts"><B label="+ Floor" on={() => structAdd(app, 'floor', b.id)} /><B label="Edit" on={() => structEdit(app, 'building', b.id)} /><B label="Delete" cls="dng" on={() => structDelete(app, 'building', b.id)} /></span> : null}</div>
      {closed[bk] ? null : <div className="kids">{b.floors.length ? b.floors.map(fl => <Floor key={fl} b={b} fl={fl} />) : <div className="muted" style={{ padding: '6px 8px' }}>No floors yet — use “+ Floor”.</div>}</div>}</div>;
  };
  const Site = ({ s }) => {
    const bls = data.buildings.filter(b => b.siteId === s.id), sk = 's:' + s.id, rids = data.rooms.filter(r => bls.some(b => b.id === r.buildingId)).map(r => r.id);
    return <div className="tnode"><div className="trow"><Tg k={sk} /><b style={{ fontSize: 15 }}>{s.name}</b><Chip>Site</Chip><Sum bids={bedsIn(rids)} />
      {ed ? <span className="tacts"><B label="+ Building" on={() => structAdd(app, 'building', s.id)} /><B label="Rename" on={() => structEdit(app, 'site', s.id)} /><B label="Delete" cls="dng" on={() => structDelete(app, 'site', s.id)} /></span> : null}</div>
      {closed[sk] ? null : <div className="kids">{bls.length ? bls.map(b => <Bld key={b.id} b={b} />) : <div className="muted" style={{ padding: '6px 8px' }}>No buildings in this site yet — use “+ Building”.</div>}</div>}</div>;
  };
  return <>
    {ed ? <div className="acts" style={{ marginBottom: 10 }}><Btn cls="pri" onClick={() => structAdd(app, 'site')}>+ Add site</Btn></div> : null}
    <p className="muted" style={{ marginTop: 0 }}>Add, rename or delete any level. A bed, room, floor, building or site can be deleted only while nobody is occupying or has reserved a bed in it; past stays keep the bed name in their history.</p>
    <div className="tree">{data.sites.length ? data.sites.map(s => <Site key={s.id} s={s} />) : <div className="empty">No sites yet. Add your first site to begin.</div>}</div>
  </>;
}
