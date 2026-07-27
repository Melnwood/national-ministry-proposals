import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { date, money } from '../shared/format.js';
import { enrichReports, reportCounts } from '../shared/reports.js';
import { projectName, country, awarded, stageKey } from '../shared/grants.js';
import { PipelineDash } from './PipelineDash.jsx';

const NOW = Date.now();
const STATUS_META = [
  { key: 'overdue',  label: 'Overdue' },
  { key: 'due-soon', label: 'Due soon' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'submitted', label: 'Submitted' },
];

export function Reports({ boot, onRefresh }) {
  const [filter, setFilter] = useState(null);

  const rows = useMemo(
    () => enrichReports(boot.reports || [], boot.props || [], NOW)
            .sort((a, b) => a.status.rank - b.status.rank || (a.status.days ?? 0) - (b.status.days ?? 0)),
    [boot.reports, boot.props]
  );
  const counts = useMemo(() => reportCounts(rows), [rows]);
  const shown = filter ? rows.filter(r => r.status.key === filter) : rows;

  return (
    <>
      <PipelineDash list={boot.props} />

      <div class="secthead">Report tracking <span class="dim">— mid-project & final reports</span></div>
      <p class="lead">Every funded grant owes a mid-project and a final report. These feed the impact numbers on the Foundations tab. Chase the overdue ones first.</p>

      <MissingReports boot={boot} onRefresh={onRefresh} />

      <div class="funnel">
        {STATUS_META.map(s => (
          <button class={`stagetile${filter === s.key ? ' on' : ''}${counts[s.key] ? '' : ' empty'}`} onClick={() => setFilter(filter === s.key ? null : s.key)}>
            <div class="ct">{counts[s.key] || 0}</div>
            <div class="nm">{s.label}</div>
          </button>
        ))}
      </div>

      <div class="secthead" style="font-size:15px">
        {filter ? STATUS_META.find(s => s.key === filter).label : 'All reports'} <span class="dim">— {shown.length}</span>
      </div>
      <div class="tablewrap">
        <table class="grants">
          <thead><tr><th>Grant</th><th>Country</th><th>Report</th><th>Due</th><th>Status</th><th class="r">Impact (L / C / P)</th></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id}>
                <td class="nm">{r.name}</td>
                <td class="cty">{r.country || '—'}</td>
                <td><span class={`kind ${r.kind.toLowerCase()}`}>{r.kind}</span></td>
                <td class="cty">{r.due ? date(r.due) : '—'}</td>
                <td><span class={`rbadge ${r.status.key}`}>{r.status.label}</span></td>
                <td class="r cty">{r.done ? `${r.leaders} / ${r.churches} / ${r.people}` : '—'}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colspan="6" class="empty-row">No reports in this group.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

const plus30 = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

// Grandfathered grants: funded before the report automations existed, so no
// report records were ever created. Mel/Amanda request them from here — the
// leader immediately gets a 'Fill out report' row on their page, and the
// report-due reminder email fires on the chosen due date.
function MissingReports({ boot, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState(plus30());
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');
  const [requested, setRequested] = useState({}); // id → 'Final'/'Mid' just requested

  const missing = useMemo(() => {
    const byProp = {};
    (boot.reports || []).forEach(r => {
      const k = /final/i.test(r.type) ? 'final' : /mid/i.test(r.type) ? 'mid' : '';
      if (k) (byProp[r.proposalId] = byProp[r.proposalId] || {})[k] = true;
    });
    return (boot.props || [])
      .filter(p => stageKey(p) === 'funded')
      .map(p => ({ p, has: byProp[p.id] || {} }))
      .filter(x => !x.has.final);
  }, [boot.props, boot.reports]);

  if (!missing.length) return null;

  async function request(p, kind) {
    setBusyId(p.id + kind); setErr('');
    try {
      await api('report_request', { recordId: p.id, kind, due, projectName: projectName(p) });
      setRequested(m => ({ ...m, [p.id + kind]: true }));
      onRefresh && onRefresh();
    } catch (e) { setErr(e.message || 'Could not request the report.'); }
    finally { setBusyId(null); }
  }

  return (
    <div class="panel" style="margin-bottom:18px">
      <button type="button" class="foldhead" style="border:none;box-shadow:none;padding:2px 0;background:transparent" onClick={() => setOpen(o => !o)}>
        <span class="secthead" style="margin:0;font-size:15px">Funded grants with no final report <span class="dim">— {missing.length}</span></span>
        <span class="dc-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style="margin-top:12px">
          <p class="lead" style="margin:0 0 10px">Older grants funded before reports were automatic. Pick a due date and request — the leader sees "Fill out report" on their page right away, and the reminder email goes out on the due date.</p>
          <label class="fld" style="max-width:220px"><span class="flbl">Due date for requests</span>
            <input type="date" value={due} onInput={e => setDue(e.currentTarget.value)} style="width:100%;padding:9px 12px;border:1px solid var(--line-d);border-radius:9px;font-family:inherit;background:#fff" />
          </label>
          {err && <div class="editerr">{err}</div>}
          <div class="tablewrap">
            <table class="grants">
              <thead><tr><th>Grant</th><th>Country</th><th class="r">Awarded</th><th>Has mid report?</th><th class="r"></th></tr></thead>
              <tbody>
                {missing.map(({ p, has }) => (
                  <tr key={p.id}>
                    <td class="nm">{projectName(p)}</td>
                    <td class="cty">{country(p)}</td>
                    <td class="r">{awarded(p) ? money(awarded(p)) : '—'}</td>
                    <td class="cty">{has.mid ? 'Yes' : 'No'}</td>
                    <td class="r">
                      {!has.mid && (requested[p.id + 'Mid']
                        ? <span class="rbadge submitted">Mid requested ✓</span>
                        : <button class="ghostbtn" disabled={busyId === p.id + 'Mid'} onClick={() => request(p, 'Mid')}>{busyId === p.id + 'Mid' ? '…' : 'Request mid'}</button>)}{' '}
                      {requested[p.id + 'Final']
                        ? <span class="rbadge submitted">Final requested ✓</span>
                        : <button class="savebtn" style="padding:8px 14px;font-size:13px" disabled={busyId === p.id + 'Final'} onClick={() => request(p, 'Final')}>{busyId === p.id + 'Final' ? '…' : 'Request final report'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
