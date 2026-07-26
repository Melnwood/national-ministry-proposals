// Builds the foundation → cycle → {given, goals, grants} structure from the
// bootstrap payload. Joins are by exact record id (grant→cycle and goal→cycle
// links), so nothing depends on fragile name matching.

import { F } from './schema.js';
import { aval } from './format.js';
import { awarded, stageKey } from './grants.js';

// Linked-record fields come back as id strings (REST) or {id,name} (some tools).
const linkIds = v => Array.isArray(v) ? v.map(x => (x && x.id) ? x.id : x) : [];
const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };

export function buildFoundations(cycles = [], goals = [], props = []) {
  const cycleList = cycles.map(c => {
    const grants = props.filter(p => linkIds(p.fields[F.proposal.cycles]).includes(c.id));
    const fundedCount = grants.filter(p => stageKey(p) === 'funded').length;

    const cycleGoals = goals
      .filter(g => linkIds(g.fields[F.goal.cycle]).includes(c.id))
      .map(g => {
        const type = aval(g.fields[F.goal.type]);
        const rollup = num(g.fields[F.goal.actual]);
        // "Projects funded" actual is reliably the count of funded grants;
        // impact goals (leaders/churches/people) use the report rollup.
        const actual = /project/i.test(type) ? fundedCount : rollup;
        return { type, target: num(g.fields[F.goal.target]), actual };
      })
      .sort((a, b) => b.target - a.target);

    return {
      id: c.id,
      foundation: aval(c.fields[F.cycle.foundation]) || 'Unassigned',
      year: aval(c.fields[F.cycle.name]) || '',
      gift: num(c.fields[F.cycle.total]),
      awarded: grants.reduce((a, p) => a + awarded(p), 0),
      grantCount: grants.length,
      fundedCount,
      goals: cycleGoals,
      grants,
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
