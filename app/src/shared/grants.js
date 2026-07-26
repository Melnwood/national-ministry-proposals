// Grant + money computations — the ONE place this logic lives (the old app
// recomputed the same figures three different ways across pages). Everything
// reads fields through the schema map, never a raw "fld…" string.

import { F, STAGES, STAGE_BY_LABEL } from './schema.js';
import { aval } from './format.js';

const field = (p, key) => (p && p.fields) ? p.fields[F.proposal[key]] : undefined;
const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };

export const projectName = p => aval(field(p, 'name')) || '(untitled)';
export const country     = p => aval(field(p, 'countryText')) || aval(field(p, 'country')) || '';
export const requested   = p => num(field(p, 'requested'));
export const awarded     = p => num(field(p, 'awarded'));
export const paid        = p => num(field(p, 'paid'));

// Coach name: prefer the populated Regional Coach Name; the new Assigned Coach
// link field returns record ids, so it's only useful once we resolve names.
export const coach = p => aval(field(p, 'regionalCoach')) || '';

export const stageLabel = p => aval(field(p, 'stage')) || '';
export const stageKey   = p => (STAGE_BY_LABEL[stageLabel(p)] || {}).key || null;

// Money still owed on a part-paid grant: awarded − paid, but only when a
// payment has actually been recorded and the award is larger. Blank "paid"
// means paid-in-full (nothing owed), matching the field's own definition.
export const owed = p => {
  const pd = field(p, 'paid');
  if (pd == null || pd === '') return 0;
  const d = awarded(p) - num(pd);
  return d > 0 ? d : 0;
};

// The headline money picture: real balance minus everything already promised.
export function moneySummary(props, bal) {
  const balance   = num(bal && bal.balance);
  const totalOwed = props.reduce((a, p) => a + owed(p), 0);
  const available = balance - totalOwed;
  const submitted = props.filter(p => stageKey(p) === 'submitted');
  const asked     = submitted.reduce((a, p) => a + requested(p), 0);
  return { balance, totalOwed, available, pendingCount: submitted.length, asked };
}

// Group proposals by canonical stage key, preserving stage order.
export function byStage(props) {
  const groups = {};
  STAGES.forEach(s => { groups[s.key] = []; });
  const loose = [];
  props.forEach(p => {
    const k = stageKey(p);
    if (k && groups[k]) groups[k].push(p); else loose.push(p);
  });
  return { groups, loose };
}
