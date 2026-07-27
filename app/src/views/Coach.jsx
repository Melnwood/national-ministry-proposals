import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, aval } from '../shared/format.js';
import { F, REVIEW_CRITERIA } from '../shared/schema.js';
import { projectName, country, coach as coachName, requested, stageKey, stageLabel } from '../shared/grants.js';
import { PipelineDash } from './PipelineDash.jsx';

// Grants a coach still owes a review on.
const QUEUE_STAGES = new Set(['submitted', 'coach']);

export function Coach({ boot, session, onRefresh }) {
  const me = (session.user && (session.user.name || '')).trim().toLowerCase();
  const isCoach = session.role && session.role.key === 'coach';

  // A coach sees only their own grants (by Regional Coach Name); oversight
  // roles (EVP/president) see everything.
  const isMine = p => {
    const c = coachName(p).trim().toLowerCase();
    return c.includes(me) || me.includes(c);
  };
  const mine = useMemo(() => {
    const list = boot.props || [];
    return (isCoach && me && !session.previewing) ? list.filter(isMine) : list;
  }, [boot.props, me, isCoach]);

  const queue = useMemo(
    () => mine.filter(p => QUEUE_STAGES.has(stageKey(p))).sort((a, b) => requested(b) - requested(a)),
    [mine]
  );

  return (
    <>
      <PipelineDash list={mine} />

      <div class="secthead">Coach review <span class="dim">— {queue.length} to review</span></div>
      <p class="lead">For each grant: confirm how it measures up, add your honest thoughts, and submit. Your notes go straight to the council for their decision — you're not approving, you're informing.</p>

      {!queue.length && <div class="panel"><p style="color:var(--muted)">Nothing waiting for your review right now.</p></div>}
      <div class="cards">
        {queue.map(p => <ReviewCard key={p.id} p={p} onDone={onRefresh} />)}
      </div>
    </>
  );
}

function ReviewCard({ p, onDone }) {
  const f = p.fields || {};
  const val = key => aval(f[F.proposal[key]]);
  const existing = Array.isArray(f[F.proposal.coachReview]) ? f[F.proposal.coachReview].map(aval) : [];

  const [checked, setChecked] = useState(new Set(existing));
  const [notes, setNotes] = useState(val('coachNotes') || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function toggle(c) {
    setChecked(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  }

  async function submit() {
    if (!notes.trim()) { setErr('Add a note with your thoughts before submitting.'); return; }
    setBusy(true); setErr('');
    const name = projectName(p);
    const fields = {
      [F.proposal.coachReview]: Array.from(checked),
      [F.proposal.coachNotes]: notes,
      [F.proposal.stage]: 'Council Lead Team Approval',
      [F.proposal.mCoachApproval]: true,
    };
    const changes = [{ type: 'Status change', label: 'Coach review submitted',
      detail: `Coach review submitted for ${name} (${checked.size} criteria noted)` }];
    try {
      await api('update', { recordId: p.id, fields, changes, projectName: name, notify: { event: 'coach_submit' } });
      onDone && onDone();
    } catch (e) { setErr(e.message || 'Could not submit.'); setBusy(false); }
  }

  return (
    <div class="dcard">
      <div class="dc-head">
        <div>
          <h3>{projectName(p)}</h3>
          <div class="dc-meta">{country(p)} · <b>{money(requested(p))}</b> requested · {val('category') || '—'}</div>
        </div>
        <span class={`badge stg-${stageKey(p)}`}>{stageLabel(p)}</span>
      </div>

      {val('problem') && <div class="dc-ctx"><span class="dt">The need</span><p>{val('problem')}</p></div>}
      {val('strategicFit') && <div class="dc-ctx"><span class="dt">Strategic fit</span><p>{val('strategicFit')}</p></div>}

      <div class="checklist">
        <div class="dt">How does this grant measure up?</div>
        {REVIEW_CRITERIA.map(c => (
          <label class={`check${checked.has(c) ? ' on' : ''}`} key={c}>
            <input type="checkbox" checked={checked.has(c)} onChange={() => toggle(c)} />
            <span>{c}</span>
          </label>
        ))}
      </div>

      <label class="fld" style="margin-top:14px">
        <span class="flbl">Your thoughts (goes to Ben &amp; the Council Lead Team)</span>
        <textarea class="notes-input" rows="7" value={notes} onInput={e => setNotes(e.currentTarget.value)}
          placeholder="What did you learn talking with the leader? Why would this be a good investment?" />
      </label>

      {err && <div class="editerr">{err}</div>}
      <div class="dc-confirm">
        <button class="savebtn" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit for Ben and Council Lead Team'}</button>
      </div>
    </div>
  );
}
