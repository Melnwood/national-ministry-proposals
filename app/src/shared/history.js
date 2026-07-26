// Country grant-history rollups for the leadership dashboard: how much each
// country has received over time, grouped by country phase, with the current
// and prior grant cycle broken out. Joins grant → cycle by record-id link and
// grant → country by the country link (falling back to the country text name).

import { F } from './schema.js';
import { aval } from './format.js';
import { awarded, paid, stageKey, stageLabel, projectName, country as countryName } from './grants.js';

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
  // cycle id → { year, foundation }, and the distinct years newest-first.
  const cycleInfo = {};
  cycles.forEach(c => { cycleInfo[c.id] = { year: aval(c.fields[F.cycle.name]) || '', foundation: aval(c.fields[F.cycle.foundation]) || '' }; });
  const cycleYear = id => (cycleInfo[id] && cycleInfo[id].year) || '';
  const years = [...new Set(Object.values(cycleInfo).map(x => x.year).filter(Boolean))]
    .sort((a, b) => String(b).localeCompare(String(a)));
  const currentYear = years[0] || '';
  const priorYear = years[1] || '';

  // Seed a row for every known country (so phases show who received nothing too).
  const byCountry = {};
  countriesMeta.forEach(c => {
    byCountry[c.id] = { name: c.name, phase: c.phase || 'Unassigned', total: 0, count: 0, current: 0, prior: 0, lastYear: '', grants: [] };
  });

  props.forEach(p => {
    const cid = linkIds(p.fields[F.proposal.country])[0] || null;
    const key = (cid && byCountry[cid]) ? cid : (countryName(p) || '(unknown)');
    const row = byCountry[key] || (byCountry[key] = {
      name: countryName(p) || '(unknown)', phase: 'Unassigned', total: 0, count: 0, current: 0, prior: 0, lastYear: '', grants: [],
    });
    const amt = received(p);
    if (amt <= 0) return;
    const cycleIds = linkIds(p.fields[F.proposal.cycles]);
    const yrs = cycleIds.map(cycleYear).filter(Boolean);
    const info = cycleInfo[cycleIds[0]] || {};
    row.total += amt; row.count += 1;
    if (currentYear && yrs.includes(currentYear)) row.current += amt;
    if (priorYear && yrs.includes(priorYear)) row.prior += amt;
    const newest = yrs.slice().sort((a, b) => String(b).localeCompare(String(a)))[0] || '';
    if (newest && String(newest) > String(row.lastYear)) row.lastYear = newest;
    row.grants.push({
      project: projectName(p), year: info.year || '', foundation: info.foundation || '',
      amount: amt, funded: stageKey(p) === 'funded', stage: stageLabel(p),
    });
  });

  // Sort each country's grants newest cycle first, then by amount.
  Object.values(byCountry).forEach(r => r.grants.sort((a, b) =>
    String(b.year).localeCompare(String(a.year)) || b.amount - a.amount));

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

  // Flat, funded-first list for the "by country" view.
  const countries = all.filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return { phases, countries, currentYear, priorYear, totals };
}
