// Country grant-history rollups for the leadership dashboard: how much each
// country has received over time, grouped by country phase, with the current
// and prior grant cycle broken out. Joins grant → cycle by record-id link and
// grant → country by the country link (falling back to the country text name).

import { F } from './schema.js';
import { aval } from './format.js';
import { awarded, paid, stageKey, country as countryName } from './grants.js';

const linkIds = v => Array.isArray(v) ? v.map(x => (x && x.id) ? x.id : x) : [];

// "Received" = money actually sent. A funded grant counts its award (or the
// recorded paid amount if no award is set); a not-yet-funded grant counts only
// what has actually been paid so far.
function received(p) {
  if (stageKey(p) === 'funded') return awarded(p) || paid(p);
  const pd = paid(p);
  return pd > 0 ? pd : 0;
}

export function buildCountryHistory(props = [], cycles = [], countriesMeta = []) {
  // cycle id → year label, and the distinct years newest-first.
  const cycleYear = {};
  cycles.forEach(c => { cycleYear[c.id] = aval(c.fields[F.cycle.name]) || ''; });
  const years = [...new Set(Object.values(cycleYear).filter(Boolean))]
    .sort((a, b) => String(b).localeCompare(String(a)));
  const currentYear = years[0] || '';
  const priorYear = years[1] || '';

  // Seed a row for every known country (so phases show who received nothing too).
  const byCountry = {};
  countriesMeta.forEach(c => {
    byCountry[c.id] = { name: c.name, phase: c.phase || 'Unassigned', total: 0, count: 0, current: 0, prior: 0, lastYear: '' };
  });

  props.forEach(p => {
    const cid = linkIds(p.fields[F.proposal.country])[0] || null;
    const key = (cid && byCountry[cid]) ? cid : (countryName(p) || '(unknown)');
    const row = byCountry[key] || (byCountry[key] = {
      name: countryName(p) || '(unknown)', phase: 'Unassigned', total: 0, count: 0, current: 0, prior: 0, lastYear: '',
    });
    const amt = received(p);
    if (amt <= 0) return;
    const yrs = linkIds(p.fields[F.proposal.cycles]).map(id => cycleYear[id]).filter(Boolean);
    row.total += amt; row.count += 1;
    if (currentYear && yrs.includes(currentYear)) row.current += amt;
    if (priorYear && yrs.includes(priorYear)) row.prior += amt;
    const newest = yrs.slice().sort((a, b) => String(b).localeCompare(String(a)))[0] || '';
    if (newest && String(newest) > String(row.lastYear)) row.lastYear = newest;
  });

  // Group by phase; countries sorted by total received (largest first).
  const byPhase = {};
  Object.values(byCountry).forEach(r => { (byPhase[r.phase] = byPhase[r.phase] || []).push(r); });
  Object.values(byPhase).forEach(arr => arr.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)));

  const phaseOrder = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5'];
  const phases = Object.entries(byPhase)
    .map(([phase, countries]) => ({
      phase, countries,
      total: countries.reduce((a, c) => a + c.total, 0),
      current: countries.reduce((a, c) => a + c.current, 0),
      funded: countries.filter(c => c.total > 0).length,
    }))
    .sort((a, b) => {
      const ia = phaseOrder.indexOf(a.phase), ib = phaseOrder.indexOf(b.phase);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return String(a.phase).localeCompare(String(b.phase));
    });

  const all = Object.values(byCountry);
  const totals = {
    all: all.reduce((a, c) => a + c.total, 0),
    countries: all.filter(c => c.total > 0).length,
    current: all.reduce((a, c) => a + c.current, 0),
  };

  return { phases, currentYear, priorYear, totals };
}
