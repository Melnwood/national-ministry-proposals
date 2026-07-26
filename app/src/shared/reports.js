// Report-tracking helpers. "Submitted" means the country actually filled the
// report (Completed By is set) — not the placeholder submission date, which is
// unreliable on the auto-created report records.

import { projectName, country } from './grants.js';

const DAY = 86400000;

export function reportStatus(r, nowMs) {
  if (r.done) return { key: 'submitted', label: 'Submitted', rank: 3 };
  if (!r.due) return { key: 'upcoming', label: 'No due date', rank: 2 };
  const days = Math.round((new Date(r.due).getTime() - nowMs) / DAY);
  if (days < 0) return { key: 'overdue', label: `${-days}d overdue`, days, rank: 0 };
  if (days <= 30) return { key: 'due-soon', label: `Due in ${days}d`, days, rank: 1 };
  return { key: 'upcoming', label: 'Upcoming', days, rank: 2 };
}

export const reportKind = r => /final/i.test(r.type) ? 'Final' : /mid/i.test(r.type) ? 'Mid' : (r.type || '—');

export function enrichReports(reports, props, nowMs) {
  const byId = Object.fromEntries(props.map(p => [p.id, p]));
  return reports.map(r => {
    const p = byId[r.proposalId];
    return {
      ...r,
      name: p ? projectName(p) : '(unknown grant)',
      country: p ? country(p) : '',
      kind: reportKind(r),
      status: reportStatus(r, nowMs),
    };
  });
}

export function reportCounts(enriched) {
  const c = { overdue: 0, 'due-soon': 0, upcoming: 0, submitted: 0 };
  enriched.forEach(r => { c[r.status.key] = (c[r.status.key] || 0) + 1; });
  return c;
}
