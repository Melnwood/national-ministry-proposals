// Builds the foundation → cycle → {given, goals, grants} structure from the
// bootstrap payload. Joins are by exact record id (grant→cycle and goal→cycle
// links), so nothing depends on fragile name matching.

import { F } from './schema.js';
import { aval } from './format.js';
import { awarded, stageKey } from './grants.js';

// Linked-record fields come back as id strings (REST) or {id,name} (some tools).
const linkIds = v => Array.isArray(v) ? v.map(x => (x && x.id) ? x.id : x) : [];
const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };

export function buildFoundations(cycles = [], goals = [], props = [], reports = [], gifts = []) {
  const cycleList = cycles.map(c => {
    const grants = props.filter(p => linkIds(p.fields[F.proposal.cycles]).includes(c.id));
    // Money sent straight to individuals out of this gift (e.g. House of
    // Vicryn) — counts against the gift just like awarded grants do.
    const directGifts = gifts.filter(g => g.cycleId === c.id)
      .sort((a, b) => b.amount - a.amount || String(a.person).localeCompare(String(b.person)));
    const directTotal = directGifts.reduce((a, g) => a + num(g.amount), 0);
    const fundedCount = grants.filter(p => stageKey(p) === 'funded').length;
    // The cycle's filed reports, joined report → grant → cycle (the report's
    // own links are unreliable); goal actuals are summed from these.
    const grantIds = new Set(grants.map(p => p.id));
    const cycReports = reports.filter(r => grantIds.has(r.proposalId));
    const sumR = k => cycReports.reduce((a, r) => a + num(r[k]), 0);

    const cycleGoals = goals
      .filter(g => linkIds(g.fields[F.goal.cycle]).includes(c.id))
      .map(g => {
        const type = aval(g.fields[F.goal.type]);
        const rollup = num(g.fields[F.goal.actual]);
        const actual = /project/i.test(type) ? fundedCount
          : /leader/i.test(type) ? sumR('leaders')
          : /church/i.test(type) ? sumR('churches')
          : /people|individual/i.test(type) ? sumR('people')
          : rollup;
        return { type, target: num(g.fields[F.goal.target]), actual };
      })
      .sort((a, b) => b.target - a.target);

    return {
      id: c.id,
      foundation: aval(c.fields[F.cycle.foundation]) || 'Unassigned',
      year: aval(c.fields[F.cycle.name]) || '',
      gift: num(c.fields[F.cycle.total]),
      acct: aval(c.fields[F.cycle.acct]) || '',
      note: aval(c.fields[F.cycle.note]) || '',
      awarded: grants.reduce((a, p) => a + awarded(p), 0),
      grantCount: grants.length,
      fundedCount,
      goals: cycleGoals,
      grants,
      directGifts,
      directTotal,
    };
  });

  const byFoundation = {};
  cycleList.forEach(cy => { (byFoundation[cy.foundation] = byFoundation[cy.foundation] || []).push(cy); });
  Object.values(byFoundation).forEach(arr => arr.sort((a, b) => String(b.year).localeCompare(String(a.year))));

  // Foundations sorted by total gift (largest first).
  return Object.entries(byFoundation)
    .map(([foundation, cyclesArr]) => ({
      foundation,
      cycles: cyclesArr,
      totalGift: cyclesArr.reduce((a, c) => a + c.gift, 0),
    }))
    .sort((a, b) => b.totalGift - a.totalGift);
}
