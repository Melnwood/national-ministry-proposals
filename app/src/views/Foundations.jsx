import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money } from '../shared/format.js';
import { buildFoundations } from '../shared/foundations.js';
import { projectName, country, awarded, requested, stageKey, stageLabel } from '../shared/grants.js';
import { PipelineDash } from './PipelineDash.jsx';

export function Foundations({ boot, onRefresh }) {
  const data = useMemo(
    () => buildFoundations(boot.cycles || [], boot.goals || [], boot.props || []),
    [boot.cycles, boot.goals, boot.props]
  );
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PipelineDash list={boot.props} />

      <div class="gt-actions">
        <div>
          <div class="secthead" style="margin:0">Foundations <span class="dim">— what each has given, their goals, and the grants</span></div>
          <p class="lead" style="margin:4px 0 0">Every funding partner, cycle by cycle: the gift, what has been awarded from it, the goals they set, and the grants underneath. Impact fills in as mid-project and final reports come back.</p>
        </div>
        <button class="btn-approve" onClick={() => setAdding(true)}>＋ Add foundation / gift</button>
      </div>

      {adding && (
        <AddGiftForm
          foundations={data.map(f => f.foundation)}
          onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); onRefresh && onRefresh(); }}
        />
      )}

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

// Add a brand-new foundation, or a new gift/cycle from a foundation that has
// given before. Both are the same record underneath: a Grant Cycle row with
// the foundation's name, a cycle name (usually the year), and the gift amount.
function AddGiftForm({ foundations, onClose, onDone }) {
  const [fnd, setFnd] = useState(foundations[0] || '__new');
  const [newFnd, setNewFnd] = useState('');
  const [name, setName] = useState(String(new Date().getFullYear()));
  const [gift, setGift] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const foundationName = fnd === '__new' ? newFnd.trim() : fnd;

  async function save() {
    if (!foundationName) { setErr('Give the foundation a name.'); return; }
    if (!name.trim()) { setErr('Give the cycle a name — usually the year.'); return; }
    setBusy(true); setErr('');
    try {
      await api('cycle_create', { fields: { foundation: foundationName, name: name.trim(), total: Number(gift) || 0 } });
      onDone();
    } catch (e) { setErr(e.message || 'Could not save.'); setBusy(false); }
  }

  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal" onClick={e => e.stopPropagation()}>
        <div class="modal-head">
          <div><h2>Add a foundation gift</h2>
            <div class="sub2">A new foundation, or another gift from one that has given before.</div></div>
          <button class="ghostbtn" onClick={onClose}>Close ✕</button>
        </div>
        <div class="editor">
          <label class="fld"><span class="flbl">Foundation</span>
            <select value={fnd} onChange={e => setFnd(e.currentTarget.value)}>
              {foundations.map(f => <option value={f}>{f}</option>)}
              <option value="__new">＋ New foundation…</option>
            </select>
          </label>
          {fnd === '__new' && (
            <label class="fld"><span class="flbl">New foundation name</span>
              <input value={newFnd} onInput={e => setNewFnd(e.currentTarget.value)} placeholder="e.g. Smith Family Foundation" />
            </label>
          )}
          <div class="fldrow">
            <label class="fld"><span class="flbl">Cycle (usually the year)</span>
              <input value={name} onInput={e => setName(e.currentTarget.value)} placeholder="e.g. 2026" />
            </label>
            <label class="fld"><span class="flbl">Gift amount</span>
              <div class="moneyin"><span>$</span><input type="number" step="500" value={gift} onInput={e => setGift(e.currentTarget.value)} placeholder="0" /></div>
            </label>
          </div>
        </div>
        {err && <div class="editerr">{err}</div>}
        <div class="modal-foot actions">
          <button class="ghostbtn" onClick={onClose} disabled={busy}>Cancel</button>
          <button class="savebtn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add gift'}</button>
        </div>
      </div>
    </div>
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
