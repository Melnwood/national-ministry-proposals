import { useState, useMemo } from 'preact/hooks';
import { money } from '../shared/format.js';
import { buildFoundations } from '../shared/foundations.js';
import { projectName, country, awarded, requested, stageKey, stageLabel } from '../shared/grants.js';

export function Foundations({ boot }) {
  const data = useMemo(
    () => buildFoundations(boot.cycles || [], boot.goals || [], boot.props || []),
    [boot.cycles, boot.goals, boot.props]
  );

  return (
    <>
      <div class="secthead">Foundations <span class="dim">— what each has given, their goals, and the grants</span></div>
      <p class="lead">Every funding partner, cycle by cycle: the gift, what has been awarded from it, the goals they set, and the grants underneath. Impact fills in as mid-project and final reports come back.</p>

      {data.map(fnd => (
        <div class="fnd" key={fnd.foundation}>
          <div class="fnd-head">
            <h2>{fnd.foundation}</h2>
            <span class="fnd-total">{money(fnd.totalGift)} <span class="dim">given across {fnd.cycles.length} {fnd.cycles.length === 1 ? 'cycle' : 'cycles'}</span></span>
          </div>
          {fnd.cycles.map(cy => <CycleCard key={cy.id} cy={cy} />)}
        </div>
      ))}
      {!data.length && <div class="panel"><p style="color:var(--muted)">No foundations/cycles found.</p></div>}
    </>
  );
}

function CycleCard({ cy }) {
  const [open, setOpen] = useState(false);
  const remaining = cy.gift - cy.awarded;
  return (
    <div class="cycle">
      <div class="cycle-top">
        <div class="cycle-year">{cy.year}</div>
        <div class="cycle-stats">
          <Stat label="Gift" val={money(cy.gift)} />
          <Stat label="Awarded" val={money(cy.awarded)} />
          <Stat label="Remaining" val={money(remaining)} tone={remaining < 0 ? 'neg' : ''} />
          <Stat label="Grants" val={`${cy.fundedCount}${cy.grantCount !== cy.fundedCount ? ` / ${cy.grantCount}` : ''}`} />
        </div>
      </div>

      {cy.goals.length > 0 && (
        <div class="goals">
          {cy.goals.map(g => <GoalBar key={g.type} g={g} />)}
        </div>
      )}

      <button class="grants-toggle" onClick={() => setOpen(o => !o)}>
        {open ? '▾' : '▸'} {cy.grantCount} {cy.grantCount === 1 ? 'grant' : 'grants'}
      </button>
      {open && (
        <div class="tablewrap" style="margin-top:10px">
          <table class="grants">
            <thead><tr><th>Grant</th><th>Country</th><th>Stage</th><th class="r">Awarded</th></tr></thead>
            <tbody>
              {cy.grants.map(p => (
                <tr key={p.id}>
                  <td class="nm">{projectName(p)}</td>
                  <td class="cty">{country(p)}</td>
                  <td><span class={`badge stg-${stageKey(p)}`}>{stageLabel(p)}</span></td>
                  <td class="r">{awarded(p) ? money(awarded(p)) : (requested(p) ? money(requested(p)) + ' req' : '—')}</td>
                </tr>
              ))}
              {!cy.grants.length && <tr><td colspan="4" class="empty-row">No grants linked to this cycle.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, val, tone }) {
  return <div class="cstat"><div class="cstat-l">{label}</div><div class={`cstat-v${tone === 'neg' ? ' neg' : ''}`}>{val}</div></div>;
}

function GoalBar({ g }) {
  const pct = g.target > 0 ? Math.min(100, Math.round((g.actual / g.target) * 100)) : 0;
  const met = g.target > 0 && g.actual >= g.target;
  return (
    <div class="goal">
      <div class="goal-row">
        <span class="goal-name">{g.type}</span>
        <span class="goal-nums"><b>{g.actual.toLocaleString()}</b> <span class="dim">/ {g.target.toLocaleString()}</span></span>
      </div>
      <div class="bar"><div class={`bar-fill${met ? ' met' : ''}`} style={`width:${pct}%`}></div></div>
    </div>
  );
}
