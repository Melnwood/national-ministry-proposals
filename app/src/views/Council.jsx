import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, aval } from '../shared/format.js';
import { F, TABLES } from '../shared/schema.js';
import { projectName, country, coach, requested, awarded, stageKey, stageLabel } from '../shared/grants.js';

import { PipelineDash } from './PipelineDash.jsx';

// Stages that are waiting on a council decision (pre-decision pipeline).
const QUEUE_STAGES = new Set(['submitted', 'coach', 'council']);

export function Council({ boot, onRefresh }) {
  const props = boot.props || [];
  const cycles = boot.cycles || [];
  const queue = useMemo(
    () => props.filter(p => QUEUE_STAGES.has(stageKey(p)))
               .sort((a, b) => requested(b) - requested(a)),
    [props]
  );

  return (
    <>
      <PipelineDash list={props} />

      <div class="secthead">Council Lead Team decisions <span class="dim">— {queue.length} awaiting a Council Lead Team decision</span></div>
      <p class="lead">Every grant a coach has submitted, with their notes, ready to decide together. Approve for this cycle, defer to the parking lot, or deny with a reason. Click a project to see the full picture.</p>

      {!queue.length && (
        <div class="panel"><p style="color:var(--muted)">Nothing is waiting on a Council Lead Team decision right now.</p></div>
      )}

      <div class="cards">
        {queue.map(p => <DecisionCard key={p.id} p={p} cycles={cycles} onDone={onRefresh} />)}
      </div>
    </>
  );
}

function DecisionCard({ p, cycles, onDone }) {
  const f = p.fields || {};
  const val = key => aval(f[F.proposal[key]]);
  const review = Array.isArray(f[F.proposal.coachReview]) ? f[F.proposal.coachReview].map(aval) : [];
  const notes = val('coachNotes');

  // Each foundation's MOST RECENT cycle only — older gifts stay out of the
  // picker so an approval can't get tied to the wrong year's money. Cycle
  // names like "2025-26" sort correctly as strings; created time breaks ties.
  const cycleOpts = useMemo(() => {
    const latest = {};
    cycles.forEach(c => {
      const foundation = aval(c.fields[F.cycle.foundation]) || 'Unassigned';
      const name = String(aval(c.fields[F.cycle.name]) || '');
      const cur = latest[foundation];
      if (!cur || name > cur.name || (name === cur.name && (c.createdTime || '') > (cur.created || ''))) {
        latest[foundation] = { id: c.id, foundation, name, created: c.createdTime || '' };
      }
    });
    return Object.values(latest)
      .sort((a, b) => a.foundation.localeCompare(b.foundation))
      .map(o => ({ id: o.id, label: `${o.foundation} — ${o.name || '(unnamed cycle)'}` }));
  }, [cycles]);

  const [mode, setMode] = useState(null); // 'approve' | 'defer' | 'deny' | null
  const [open, setOpen] = useState(false); // compact row by default; click for the full picture
  const [amount, setAmount] = useState(awarded(p) ? String(awarded(p)) : (requested(p) ? String(requested(p)) : ''));
  const [cycleId, setCycleId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function decide(kind) {
    setBusy(true); setErr('');
    const fields = {}; const changes = [];
    const name = projectName(p);
    if (message.trim()) fields[F.proposal.decisionMessage] = message.trim();
    if (kind === 'approve') {
      fields[F.proposal.stage] = 'At Accounting';
      fields[F.proposal.awarded] = Number(amount) || 0;
      fields[F.proposal.dateApproved] = new Date().toISOString().slice(0, 10);
      // The council's approval IS the sign-off: stamp both milestone checkboxes
      // so Accounting (and Airtable) show the grant came through the right way.
      fields[F.proposal.evpApproval] = true;
      fields[F.proposal.mCouncilApproval] = true;
      if (cycleId) fields[F.proposal.cycles] = [cycleId];
      changes.push({ type: 'Status change', label: `Approved — ${money(Number(amount) || 0)}`,
        detail: `Council approved ${name} at ${money(Number(amount) || 0)}${message ? ` — ${message}` : ''}` });
    } else if (kind === 'defer') {
      fields[F.proposal.stage] = 'Deferred';
      if (amount) fields[F.proposal.awarded] = Number(amount) || 0;
      fields[F.proposal.lastConfirmed] = new Date().toISOString().slice(0, 10);
      changes.push({ type: 'Status change', label: 'Approved — deferred',
        detail: `Council approved ${name} but deferred funding to a later cycle${message ? ` — ${message}` : ''}` });
    } else if (kind === 'deny') {
      if (!message.trim()) { setErr('Please give a reason — it will be shown to the country.'); setBusy(false); return; }
      fields[F.proposal.stage] = 'Denied';
      changes.push({ type: 'Status change', label: 'Denied',
        detail: `Council denied ${name} — ${message}` });
    }
    try {
      await api('update', { recordId: p.id, fields, changes, projectName: name, notify: { event: 'decision', kind } });
      onDone && onDone();
    } catch (e) { setErr(e.message || 'Could not save.'); setBusy(false); }
  }

  return (
    <div class="dcard slim">
      <div class="dc-row" onClick={() => setOpen(o => !o)}>
        <span class="dc-caret">{open ? '▾' : '▸'}</span>
        <div class="dc-rowmain">
          <h3>{projectName(p)}</h3>
          <div class="dc-meta">{country(p)}{coach(p) ? ` · Coach: ${coach(p)}` : ''} · <b>{money(requested(p))}</b> requested</div>
        </div>
        {!mode && (
          <div class="dc-actions slim" onClick={e => e.stopPropagation()}>
            <button class="btn-approve" onClick={() => { setMode('approve'); setErr(''); }}>Approve</button>
            <button class="btn-defer" onClick={() => { setMode('defer'); setErr(''); }}>Defer</button>
            <button class="btn-deny" onClick={() => { setMode('deny'); setErr(''); }}>Deny</button>
          </div>
        )}
      </div>

      {open && (
        <div class="dc-details">
          <div class="dc-meta" style="margin-bottom:8px">{val('category') || '—'}</div>
          {review.length > 0 && (
            <div class="chips">{review.map(r => <span class="chip">{shortCrit(r)}</span>)}</div>
          )}
          <div class="dc-notes">
            <div class="dt">Coach notes</div>
            {notes ? <p>{notes}</p> : <p class="muted">No coach notes yet.</p>}
          </div>
          {val('problem') && <div class="dc-ctx"><span class="dt">Need</span><p>{val('problem')}</p></div>}
        </div>
      )}

      {mode && (
        <div class="dc-form">
          {(mode === 'approve' || mode === 'defer') && (
            <div class="fldrow">
              <label class="fld"><span class="flbl">{mode === 'approve' ? 'Award amount' : 'Intended amount (optional)'}</span>
                <div class="moneyin"><span>$</span><input type="number" step="50" value={amount} onInput={e => setAmount(e.currentTarget.value)} /></div>
                {requested(p) > 0 && <button type="button" class="mini" onClick={() => setAmount(String(requested(p)))}>Requested = {money(requested(p))}</button>}
              </label>
              {mode === 'approve' && (
                <label class="fld"><span class="flbl">Foundation grant cycle</span>
                  <select value={cycleId} onChange={e => setCycleId(e.currentTarget.value)}>
                    <option value="">— none —</option>
                    {cycleOpts.map(c => <option value={c.id}>{c.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
          <label class="fld"><span class="flbl">{mode === 'deny' ? 'Reason (shown to the country)' : 'Message (optional)'}</span>
            <textarea rows="2" value={message} onInput={e => setMessage(e.currentTarget.value)}
              placeholder={mode === 'deny' ? 'Why this was declined…' : 'A note to accompany the decision…'} />
          </label>
          {err && <div class="editerr">{err}</div>}
          <div class="dc-confirm">
            <button class="ghostbtn" onClick={() => { setMode(null); setErr(''); }} disabled={busy}>Cancel</button>
            <button class={mode === 'deny' ? 'btn-deny solid' : 'savebtn'} disabled={busy} onClick={() => decide(mode)}>
              {busy ? 'Saving…' : mode === 'approve' ? 'Confirm approval' : mode === 'defer' ? 'Confirm defer' : 'Confirm denial'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The review criteria are long sentences; show just the leading label.
function shortCrit(s) { const m = /^([^(]+)/.exec(s || ''); return (m ? m[1] : s).trim(); }
