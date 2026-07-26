import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { signOut } from '../shared/auth.js';
import { money, date, aval } from '../shared/format.js';
import { STAGES, STAGE_BY_KEY, ACTIVE_STAGE_KEYS, TERMINAL_STAGE_KEYS, F } from '../shared/schema.js';
import { moneySummary, byStage, projectName, country, coach, requested, awarded, paid, owed, stageKey, stageLabel } from '../shared/grants.js';

export function GrantTeam({ boot, session, onRefresh }) {
  const props = boot.props || [];
  const [filter, setFilter] = useState(null);   // stage key, or null = all
  const [openId, setOpenId] = useState(null);

  const summary = useMemo(() => moneySummary(props, boot.bal), [props, boot.bal]);
  const { groups } = useMemo(() => byStage(props), [props]);
  const counts = k => (groups[k] ? groups[k].length : 0);

  const shown = useMemo(() => {
    const list = filter ? (groups[filter] || []) : props;
    // sort by stage order, then by awarded/requested desc
    const order = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));
    return [...list].sort((a, b) => {
      const sa = order[stageKey(a)] ?? 99, sb = order[stageKey(b)] ?? 99;
      if (sa !== sb) return sa - sb;
      return (awarded(b) || requested(b)) - (awarded(a) || requested(a));
    });
  }, [props, groups, filter]);

  const openGrant = openId ? props.find(p => p.id === openId) : null;

  return (
    <div class="shell wide">
      <div class="topbar">
        <div class="brand">
          <div class="mk">JV</div>
          <div><h1>Grant Team</h1><div class="sub">National Ministries · grant lifecycle</div></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="who">{session.user.name || session.user.email}{session.role ? ` · ${session.role.label}` : ''}</span>
          {onRefresh && <button class="ghostbtn" onClick={onRefresh}>↻ Refresh</button>}
          <button class="ghostbtn" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {/* Money picture */}
      <section class="money">
        <div class="mtile">
          <div class="mlbl">Cash in account 510181</div>
          <div class="mval">{money(summary.balance)}</div>
          <div class="mnote">{boot.bal && boot.bal.asOf ? `As of ${date(boot.bal.asOf)}` : 'No balance on file'}</div>
        </div>
        <div class="mtile">
          <div class="mlbl">Still owed on part-paid grants</div>
          <div class="mval neg">− {money(summary.totalOwed)}</div>
          <div class="mnote">Promised, not yet sent</div>
        </div>
        <div class="mtile hero">
          <div class="mlbl">Available to grant</div>
          <div class="mval">{money(summary.available)}</div>
          <div class="mnote">{summary.pendingCount} pending {summary.pendingCount === 1 ? 'request' : 'requests'} asking {money(summary.asked)}</div>
        </div>
      </section>

      {/* Pipeline funnel */}
      <div class="secthead">Pipeline <span class="dim">— click a stage to filter</span></div>
      <div class="funnel">
        {ACTIVE_STAGE_KEYS.map(k => (
          <button class={`stagetile${filter === k ? ' on' : ''}${counts(k) ? '' : ' empty'}`} onClick={() => setFilter(filter === k ? null : k)}>
            <div class="ct">{counts(k)}</div>
            <div class="nm">{STAGE_BY_KEY[k].label}</div>
          </button>
        ))}
      </div>
      <div class="funnel term">
        {TERMINAL_STAGE_KEYS.map(k => (
          <button class={`stagetile sm${filter === k ? ' on' : ''}${counts(k) ? '' : ' empty'}`} onClick={() => setFilter(filter === k ? null : k)}>
            <span class="ct">{counts(k)}</span><span class="nm">{STAGE_BY_KEY[k].label}</span>
          </button>
        ))}
        {filter && <button class="clearbtn" onClick={() => setFilter(null)}>Clear filter ✕</button>}
      </div>

      {/* Grant list */}
      <div class="secthead">
        {filter ? STAGE_BY_KEY[filter].label : 'All grants'} <span class="dim">— {shown.length}</span>
      </div>
      <div class="tablewrap">
        <table class="grants">
          <thead>
            <tr><th>Grant</th><th>Country</th><th>Coach</th><th>Stage</th><th class="r">Requested</th><th class="r">Awarded</th><th class="r">Owed</th></tr>
          </thead>
          <tbody>
            {shown.map(p => (
              <tr onClick={() => setOpenId(p.id)} class="clk">
                <td class="nm">{projectName(p)}</td>
                <td class="cty">{country(p)}</td>
                <td class="cty">{coach(p) || '—'}</td>
                <td><StageBadge k={stageKey(p)} /></td>
                <td class="r">{requested(p) ? money(requested(p)) : '—'}</td>
                <td class="r">{awarded(p) ? money(awarded(p)) : '—'}</td>
                <td class="r owe">{owed(p) ? money(owed(p)) : '—'}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colspan="7" class="empty-row">No grants in this stage.</td></tr>}
          </tbody>
        </table>
      </div>

      {openGrant && <GrantDetail p={openGrant} onClose={() => setOpenId(null)} onSaved={onRefresh} />}
    </div>
  );
}

function StageBadge({ k }) {
  const s = STAGE_BY_KEY[k];
  if (!s) return <span class="badge">—</span>;
  return <span class={`badge stg-${k}`}>{s.label}</span>;
}

function GrantDetail({ p, onClose, onSaved }) {
  const f = p.fields || {};
  const val = key => aval(f[F.proposal[key]]);

  // editable state, seeded from the record
  const [stage, setStage]     = useState(stageLabel(p) || 'Submitted');
  const [award, setAward]     = useState(awarded(p) ? String(awarded(p)) : '');
  const [paidAmt, setPaidAmt] = useState(paid(p) ? String(paid(p)) : '');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState('');

  const reqNum   = requested(p);
  const awardNum = Number(award) || 0;
  const paidNum  = Number(paidAmt) || 0;
  const owedNow  = paidAmt !== '' && awardNum - paidNum > 0 ? awardNum - paidNum : 0;

  const origStage = stageLabel(p) || '';
  const dirty = stage !== origStage
    || awardNum !== (awarded(p) || 0)
    || (paidAmt === '' ? paid(p) !== 0 && paid(p) != null : paidNum !== (paid(p) || 0));

  async function save() {
    setBusy(true); setErr('');
    const fields = {};
    const changes = [];
    if (stage !== origStage) {
      fields[F.proposal.stage] = stage;
      changes.push({ type: 'Stage change', label: `Stage → ${stage}`, detail: `Stage moved from ${origStage || '(none)'} to ${stage}` });
      // stamp the outcome date when it makes sense
      if (stage === 'Funded' && !val('dateFunded')) fields[F.proposal.dateFunded] = today();
      if ((stage === 'Council Decision' || stage === 'Grant Team Approved') && !val('dateApproved')) fields[F.proposal.dateApproved] = today();
    }
    if (awardNum !== (awarded(p) || 0)) {
      fields[F.proposal.awarded] = awardNum;
      changes.push({ type: 'Funding assignment', label: `Awarded ${money(awardNum)}`, detail: `Grant Amount Awarded set to ${money(awardNum)}` });
    }
    const paidChanged = paidAmt === '' ? (paid(p) != null && paid(p) !== 0) : paidNum !== (paid(p) || 0);
    if (paidChanged) {
      fields[F.proposal.paid] = paidAmt === '' ? null : paidNum;
      changes.push({ type: 'Funding assignment', label: `Paid to date ${money(paidNum)}`, detail: `Amount Paid to Date set to ${money(paidNum)}` });
    }
    try {
      await api('update', { recordId: p.id, fields, changes, projectName: projectName(p) });
      onSaved && onSaved();
      onClose();
    } catch (e) {
      setErr(e.message || 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal" onClick={e => e.stopPropagation()}>
        <div class="modal-head">
          <div>
            <StageBadge k={stageKey(p)} />
            <h2>{projectName(p)}</h2>
            <div class="sub2">{country(p)}{coach(p) ? ` · Coach: ${coach(p)}` : ''}</div>
          </div>
          <button class="ghostbtn" onClick={onClose}>Close ✕</button>
        </div>

        {/* editable actions */}
        <div class="editor">
          <label class="fld">
            <span class="flbl">Stage</span>
            <select value={stage} onChange={e => setStage(e.currentTarget.value)}>
              {STAGES.map(s => <option value={s.label}>{s.label}</option>)}
            </select>
          </label>

          <div class="fldrow">
            <label class="fld">
              <span class="flbl">Awarded</span>
              <div class="moneyin"><span>$</span><input type="number" step="50" value={award}
                placeholder={reqNum ? String(reqNum) : '0'} onInput={e => setAward(e.currentTarget.value)} /></div>
              {reqNum > 0 && (
                <button type="button" class="mini" onClick={() => setAward(String(Math.round(reqNum * 0.9)))}>
                  Requested − 10% = {money(Math.round(reqNum * 0.9))}
                </button>
              )}
            </label>
            <label class="fld">
              <span class="flbl">Paid to date</span>
              <div class="moneyin"><span>$</span><input type="number" step="50" value={paidAmt}
                placeholder="—" onInput={e => setPaidAmt(e.currentTarget.value)} /></div>
              <span class="mini dim">{owedNow ? `Still owed ${money(owedNow)}` : 'Blank = paid in full'}</span>
            </label>
          </div>
        </div>

        {/* read-only context */}
        <div class="dl">
          <div class="dlrow"><span class="dt">Requested</span><span class="dd">{reqNum ? money(reqNum) : '—'}</span></div>
          <div class="dlrow"><span class="dt">Category</span><span class="dd">{val('category') || '—'}</span></div>
          <div class="dlrow"><span class="dt">Priority</span><span class="dd">{val('priority') || '—'}</span></div>
          <div class="dlrow"><span class="dt">Start → End</span><span class="dd">{val('startDate') ? date(val('startDate')) : '—'} → {val('endDate') ? date(val('endDate')) : '—'}</span></div>
          <div class="dlrow"><span class="dt">Date funded</span><span class="dd">{val('dateFunded') ? date(val('dateFunded')) : '—'}</span></div>
        </div>
        {val('coachNotes') && <div class="notes"><div class="dt">Coach notes</div><p>{val('coachNotes')}</p></div>}

        {err && <div class="editerr">{err}</div>}
        <div class="modal-foot actions">
          <button class="ghostbtn" onClick={onClose} disabled={busy}>Cancel</button>
          <button class="savebtn" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

function today() { return new Date().toISOString().slice(0, 10); }
