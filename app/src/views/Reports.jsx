import { useState, useMemo } from 'preact/hooks';
import { date } from '../shared/format.js';
import { enrichReports, reportCounts } from '../shared/reports.js';
import { PipelineDash } from './PipelineDash.jsx';

const NOW = Date.now();
const STATUS_META = [
  { key: 'overdue',  label: 'Overdue' },
  { key: 'due-soon', label: 'Due soon' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'submitted', label: 'Submitted' },
];

export function Reports({ boot }) {
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
