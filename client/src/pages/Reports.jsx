import { useMemo } from 'react';
import { useApp } from '../context.jsx';
import { PageHead, Badge, BADGE, FInput, FSelect } from '../components/ui.jsx';
import { today, fd } from '@shared/dates.js';
import { makeReports, reportCtx, exportReport, PERIODS, shiftPeriod } from '../lib/reports.js';

const GROUPS = [{ v: 'branch', l: 'Branch wise' }, { v: 'state', l: 'State wise' }, { v: 'month', l: 'Month wise' }, { v: 'week', l: 'Week wise' }, { v: 'day', l: 'Day wise' }];

export default function Reports() {
  const { D, me, ui, setF, setFs } = useApp(), f = ui.f;
  const REPORTS = useMemo(() => makeReports(D), [D]);
  const rep = REPORTS.find(r => r.id === (f['rp.id'] || 'summary')) || REPORTS[0], u = rep.uses;
  const c = reportCtx(f, D), out = rep.run(c);
  const per = c.per, at = c.at, periodic = !['all', 'custom'].includes(per);
  const showBranch = u.includes('branch') && (me.role !== 'coordinator' || D.family.size > 1);
  const dateInput = (k, def) => <input type="date" className="in" value={f[k] || def || ''} onChange={e => setF(k, e.target.value)} />;

  /* human-readable filter summary (shown on screen, in print and in exports) */
  const filters = [
    u.includes('branch') && c.br ? 'Branch: ' + D.bName(c.br) + (D.data.branches.some(b => b.parentId === c.br) ? ' (with sub-branches)' : '') : null,
    (u.includes('state') || u.includes('branch')) && c.st ? 'State: ' + c.st : null,
    u.includes('dept') && c.dp ? 'Department: ' + D.dName(c.dp) : null,
    u.includes('group') ? 'Grouped: ' + GROUPS.find(g => g.v === c.grp).l : null,
    u.includes('q') && c.q ? `Search: “${f['rp.q']}”` : null
  ].filter(Boolean);
  /* the date range is added only where the period name doesn't already say it (e.g. 'Oct 2026' → '01 Oct – 31 Oct 2026') */
  const meta = { period: u.includes('period') ? c.label + (['month', 'year'].includes(per) ? ` (${fd(c.from)} – ${fd(c.to)})` : '') : 'Current', short: u.includes('period') ? c.label : 'current', filters: filters.join(' · ') || 'All branches and states' };

  return <>
    <PageHead title="Reports" sub="Choose a report and a period (daily, weekly, monthly, quarterly, annual), filter by branch or state, then export or print.">
      <button className="btn" onClick={() => exportReport(rep, out, 'csv', meta)}>Export CSV</button>
      <button className="btn" onClick={() => exportReport(rep, out, 'xls', meta)}>Export Excel</button>
      <button className="btn" onClick={() => window.print()}>Print</button>
    </PageHead>
    <div className="card">
      <div className="filters">
        <label className="flabel">Report<FSelect k="rp.id" opts={REPORTS.map(r => ({ v: r.id, l: r.name }))} /></label>
        {u.includes('period') ? <label className="flabel">Period<FSelect k="rp.per" opts={PERIODS} onPick={v => { if (v === 'custom' && c.from) setFs({ 'rp.from': c.from, 'rp.to': c.to }); }} /></label> : null}
        {u.includes('period') && periodic ? <div className="flabel"><span>{PERIODS.find(p => p.v === per).l.replace(/ \(.*/, '')} containing</span>
          <div className="pstep">
            <button type="button" className="btn" aria-label="Previous period" onClick={() => setF('rp.at', shiftPeriod(per, at, -1))}>‹</button>
            {dateInput('rp.at', today())}
            <button type="button" className="btn" aria-label="Next period" onClick={() => setF('rp.at', shiftPeriod(per, at, 1))}>›</button>
            {at !== today() ? <button type="button" className="btn" onClick={() => setF('rp.at', today())}>Current</button> : null}
          </div></div> : null}
        {u.includes('period') && per === 'custom' ? <><label className="flabel">From{dateInput('rp.from')}</label><label className="flabel">To{dateInput('rp.to')}</label></> : null}
      </div>
      <div className="filters">
        {showBranch ? <label className="flabel">Branch<FSelect k="rp.br" opts={D.branchOpts()} all="All branches" /></label> : null}
        {u.includes('state') || u.includes('branch') ? <label className="flabel">State<FSelect k="rp.st" opts={D.STATES} all="All states" /></label> : null}
        {u.includes('dept') ? <label className="flabel">Department<FSelect k="rp.dp" opts={D.deptOpts().filter(o => me.role !== 'supervisor' || o.v === me.deptId)} all="All departments" /></label> : null}
        {u.includes('group') ? <label className="flabel">Group by<FSelect k="rp.grp" opts={GROUPS} /></label> : null}
        {u.includes('q') ? <label className="flabel">Search<FInput k="rp.q" ph="Name, ID or mobile…" /></label> : null}
      </div>
      <div className="rp-meta">
        <b>{rep.name}</b>
        <span><span className="chip">Period: {meta.period}</span>{filters.map(x => <span key={x} className="chip">{x}</span>)}</span>
        <span className="muted">{out.rows.length} row(s){out.note ? ' · ' + out.note : ''}</span>
      </div>
      {out.rows.length ? <div className="tw"><table className="rt"><thead><tr>{out.cols.map(col => <th key={col}>{col}</th>)}</tr></thead>
        <tbody>{out.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} data-label={out.cols[j]}>{out.cols[j] === 'Status' && BADGE[v] ? <Badge s={v} /> : v}</td>)}</tr>)}</tbody>
        {out.total ? <tfoot><tr className="rp-total">{out.total.map((v, j) => <td key={j} data-label={out.cols[j]}>{v}</td>)}</tr></tfoot> : null}
      </table></div>
        : <div className="empty">No rows for these filters.</div>}
    </div>
  </>;
}
