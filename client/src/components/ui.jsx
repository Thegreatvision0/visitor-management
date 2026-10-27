/* Small presentational building blocks shared by every page. */
import { useEffect, useState } from 'react';
import { useApp } from '../context.jsx';
import { natCmp } from '@shared/text.js';

/* per-browser conveniences (column choice, saved filters); the app works the same without them */
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('nm.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('nm.' + k, JSON.stringify(v)); } catch { /* private mode */ } }
};

export const BADGE = {
  Draft: 'gray', Submitted: 'info', Approved: 'ok', Rejected: 'bad', Cancelled: 'gray', 'Checked In': 'pur', 'Checked Out': 'gray', Available: 'ok', Occupied: 'bad', Reserved: 'warn', Cleaning: 'info',
  Present: 'ok', Absent: 'bad', Leave: 'warn', 'Not Marked': 'gray', Active: 'ok', Ended: 'gray', Pending: 'warn', 'Short-Term': 'info', Monthly: 'pur', 'Long-Term': 'warn', Resident: 'pur', Overdue: 'bad', Expected: 'info', Arrived: 'ok', Departed: 'gray',
  Invited: 'gray', Accepted: 'info', Declined: 'bad', 'Awaiting office': 'warn', 'Office rejected': 'bad', Confirmed: 'ok', Completed: 'gray',
  'Not arrived': 'warn', Archived: 'gray'
};
export const Badge = ({ s, cls }) => <span className={'b ' + (cls || BADGE[s] || 'gray')}>{s}</span>;

/** Normalise options: strings or {v, l}. */
export const normOpts = opts => (opts || []).map(o => typeof o === 'object' ? o : { v: o, l: o });

/**
 * Table with paging and, where a column says how, sorting.
 * cols: [label, render, opts] — opts: { sort: row → value, csv: row → text, hide: true (hidden until chosen) }
 * id: remembers the chosen columns in this browser and shows the column chooser
 * select: { sel: Set of keys, set(Set) } adds tick boxes for bulk actions; bulk: buttons shown while rows are ticked
 * csv: file name → adds "Export CSV" (all rows after filters and sorting)
 */
export function Table({ cols, rows, empty, rowKey, id, pageSize = 25, select, bulk, csv }) {
  const key = r => rowKey ? rowKey(r) : r.id;
  const [sort, setSort] = useState(null), [page, setPage] = useState(0), [chooser, setChooser] = useState(false);
  const label = c => typeof c[0] === 'string' && c[0] ? c[0] : '';
  const [hidden, setHidden] = useState(() => new Set(id ? store.get('cols.' + id, cols.filter(c => c[2] && c[2].hide).map(label)) : []));
  useEffect(() => { setPage(0); }, [rows.length]);
  if (!rows.length) return <div className="empty">{empty || 'No records found.'}</div>;
  const shown = cols.filter(c => !label(c) || !hidden.has(label(c)));
  let list = rows;
  if (sort) { const c = cols[sort.i], f = c[2].sort; list = rows.slice().sort((a, b) => natCmp(f(a), f(b)) * sort.dir); }
  const pages = Math.max(1, Math.ceil(list.length / pageSize)), cur = Math.min(page, pages - 1);
  const pageRows = list.length > pageSize ? list.slice(cur * pageSize, cur * pageSize + pageSize) : list;
  const toggleCol = l => { const h = new Set(hidden); h.has(l) ? h.delete(l) : h.add(l); setHidden(h); if (id) store.set('cols.' + id, [...h]); };
  const sel = select ? select.sel : null, allOnPage = sel && pageRows.every(r => sel.has(key(r)));
  const tick = (r, on) => { const s = new Set(sel); on ? s.add(key(r)) : s.delete(key(r)); select.set(s); };
  const exportCsv = () => {
    const cs = shown.filter(label), txt = (c, r) => c[2] && c[2].csv ? c[2].csv(r) : c[2] && c[2].sort ? c[2].sort(r) : '';
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const body = [cs.map(c => q(label(c))).join(',')].concat(list.map(r => cs.map(c => q(txt(c, r))).join(','))).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv' })); a.download = csv + '.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  const tools = id || csv || (sel && sel.size);
  return <>
    {tools ? <div className="ttools">
      {sel && sel.size ? <span className="tsel"><b>{sel.size}</b> selected {bulk}<button type="button" className="btn sm" onClick={() => select.set(new Set())}>Clear</button>
        {sel.size < list.length ? <button type="button" className="btn sm" onClick={() => select.set(new Set(list.map(key)))}>Select all {list.length}</button> : null}</span> : <span />}
      <span className="acts">
        {csv ? <button type="button" className="btn sm" onClick={exportCsv}>Export CSV</button> : null}
        {id ? <span className="colpick"><button type="button" className="btn sm" onClick={() => setChooser(x => !x)} aria-expanded={chooser}>Columns ▾</button>
          {chooser ? <div className="dd">{cols.filter(label).map(c => <label key={label(c)} className="check"><input type="checkbox" checked={!hidden.has(label(c))} onChange={() => toggleCol(label(c))} />{label(c)}</label>)}</div> : null}</span> : null}
      </span>
    </div> : null}
    <div className="tw"><table className="rt">
      <thead><tr>
        {sel ? <th className="tck"><input type="checkbox" aria-label="Select all on this page" checked={!!allOnPage} onChange={e => { const s = new Set(sel); pageRows.forEach(r => e.target.checked ? s.add(key(r)) : s.delete(key(r))); select.set(s); }} /></th> : null}
        {shown.map((c, i) => { const ci = cols.indexOf(c), can = c[2] && c[2].sort, on = sort && sort.i === ci;
          return <th key={i} aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>{can
            ? <button type="button" className={'sortb' + (on ? ' on' : '')} onClick={() => setSort(on && sort.dir < 0 ? null : { i: ci, dir: on ? -1 : 1 })}>{c[0]}<i>{on ? (sort.dir > 0 ? '▲' : '▼') : '↕'}</i></button> : c[0]}</th>; })}
      </tr></thead>
      {/* data-label: on phones each row becomes a card with the column name beside each value */}
      <tbody>{pageRows.map((r, i) => <tr key={key(r) || i} className={sel && sel.has(key(r)) ? 'picked' : ''}>
        {sel ? <td className="tck" data-label=""><input type="checkbox" aria-label="Select row" checked={sel.has(key(r))} onChange={e => tick(r, e.target.checked)} /></td> : null}
        {shown.map((c, j) => <td key={j} data-label={label(c)}>{c[1](r)}</td>)}</tr>)}</tbody>
    </table></div>
    {list.length > pageSize ? <div className="pager">
      <span className="muted">{cur * pageSize + 1}–{Math.min(list.length, cur * pageSize + pageSize)} of {list.length}</span>
      <span className="acts"><button type="button" className="btn sm" disabled={!cur} onClick={() => setPage(0)}>« First</button><button type="button" className="btn sm" disabled={!cur} onClick={() => setPage(cur - 1)}>‹ Prev</button>
        <b>Page {cur + 1} / {pages}</b><button type="button" className="btn sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next ›</button><button type="button" className="btn sm" disabled={cur >= pages - 1} onClick={() => setPage(pages - 1)}>Last »</button></span>
    </div> : null}
  </>;
}

/** Named filter sets for a page, kept in this browser (e.g. "Delhi residents"). keys: the ui.f keys the page uses. */
export function SavedFilters({ page, keys }) {
  const { ui, setFs, toast } = useApp();
  const [list, setList] = useState(() => store.get('filters.' + page, []));
  const save = l => { setList(l); store.set('filters.' + page, l); };
  const cur = Object.fromEntries(keys.map(k => [k, ui.f[k] || '']));
  const add = () => {
    if (!keys.some(k => cur[k])) return toast('Set some filters first, then save them.');
    const name = (window.prompt('Name for these filters (e.g. "Delhi residents"):') || '').trim(); if (!name) return;
    save([...list.filter(x => x.name !== name), { name, f: cur }]); toast(`Filters saved as “${name}”`, 'ok');
  };
  return <span className="acts savedf">
    <select className="in" value="" aria-label="Saved filters" onChange={e => { const x = list.find(y => y.name === e.target.value); if (x) setFs({ ...Object.fromEntries(keys.map(k => [k, ''])), ...x.f }); }}>
      <option value="">{list.length ? 'Saved filters…' : 'No saved filters'}</option>{list.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}
    </select>
    <button type="button" className="btn sm" onClick={add} title="Save the current filters">Save filters</button>
    <button type="button" className="btn sm" onClick={() => setFs(Object.fromEntries(keys.map(k => [k, ''])))}>Clear</button>
    {list.length ? <button type="button" className="btn sm dng" title="Delete a saved filter set" onClick={() => { const n = window.prompt('Delete which saved filter set?\n' + list.map(x => x.name).join('\n')); if (n) save(list.filter(x => x.name !== n.trim())); }}>Delete…</button> : null}
  </span>;
}

/** Attendance % — red below 60, amber below 75, green from 75. */
export const AttPct = ({ pct }) => pct == null ? '—' : <span className={'b ' + (pct < 60 ? 'bad' : pct < 75 ? 'warn' : 'ok')} title={pct < 60 ? 'Low attendance' : ''}>{pct}%</span>;

/** Password box with a show / hide button. */
export function PwInput(props) {
  const [show, setShow] = useState(false);
  return <span className="pw"><input {...props} type={show ? 'text' : 'password'} />
    <button type="button" className="pw-eye" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{show ? <path d="M3 3l18 18" /> : null}</svg>
    </button></span>;
}

export const PageHead = ({ title, sub, children }) => (
  <div className="ph"><div><h1>{title}</h1>{sub ? <p className="muted" style={{ margin: '4px 0 0' }}>{sub}</p> : null}</div><div className="acts">{children}</div></div>
);
export const Btn = ({ cls, children, ...p }) => <button type="button" className={'btn sm ' + (cls || '')} {...p}>{children}</button>;
export const PBtn = ({ children, ...p }) => <button type="button" className="btn pri" {...p}>{children}</button>;

export function Tabs({ page, list }) {
  const { ui, setTab } = useApp(), cur = ui.tab[page] || list[0][0];
  return (
    <div className="tabs">{list.map(t => (
      <button key={t[0]} type="button" className={'tab' + (cur === t[0] ? ' on' : '')} onClick={() => setTab(page, t[0])}>
        {t[1]}{t[2] != null ? <span className="cnt">{t[2]}</span> : null}
      </button>
    ))}</div>
  );
}
export const useTab = (page, def) => useApp().ui.tab[page] || def;

const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const Avatar = ({ m, size }) => {
  if (!m) return <span className="av" style={{ background: 'var(--gray)' }}>?</span>;
  const st = size ? { width: size, height: size, borderRadius: 10 } : null;
  return m.photo ? <img className="av" style={st} src={m.photo} alt="" />
    : <span className="av" style={{ ...st, background: `hsl(${hue(m.name)} 45% 40%)` }}>{m.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</span>;
};
export const Bar = ({ l, v, max }) => <div className="row"><span>{l}</span><div className="bar"><i style={{ width: (max ? Math.round(v / max * 100) : 0) + '%' }} /></div><b>{v}</b></div>;

/* Filter controls bound to ui.f[key] (kept while moving between pages). */
export function FInput({ k, ph, type }) {
  const { ui, setF } = useApp();
  return <input className="in" type={type || 'text'} value={ui.f[k] || ''} placeholder={ph} onChange={e => setF(k, e.target.value)} />;
}
export function FSelect({ k, opts, all, onPick }) {
  const { ui, setF } = useApp();
  return (
    <select className="in" value={ui.f[k] || ''} onChange={e => { setF(k, e.target.value); if (onPick) onPick(e.target.value); }}>
      {all != null ? <option value="">{all}</option> : null}
      {normOpts(opts).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}
export const KV = ({ items }) => <div className="kv">{items.filter(Boolean).map(([k, v, full]) => <div key={k} style={full ? { gridColumn: '1/-1' } : null}><span>{k}</span>{v}</div>)}</div>;
export const Chip = ({ children }) => <span className="chip">{children}</span>;
