import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, date, aval } from '../shared/format.js';
import { STAGES, STAGE_BY_KEY, ACTIVE_STAGE_KEYS, TERMINAL_STAGE_KEYS, F } from '../shared/schema.js';
import { moneySummary, byStage, projectName, country, coach, requested, awarded, paid, owed, stageKey, stageLabel } from '../shared/grants.js';
import { PIPELINE_FLOW, TILE_LABEL } from './PipelineDash.jsx';
import { FoundationReport } from './FoundationReport.jsx';

// Approved but waiting on money — the projects the grant team can pay for if
// funds free up. Council-pending, at-accounting, funded, denied and archived
// are all excluded.
const ONGOING_STAGES = new Set(['deferred']);

// Sort by pipeline stage order, then by biggest money first.
function sortGrants(list) {
  const order = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));
  return [...list].sort((a, b) => {
    const sa = order[stageKey(a)] ?? 99, sb = order[stageKey(b)] ?? 99;
    if (sa !== sb) return sa - sb;
    return (awarded(b) || requested(b)) - (awarded(a) || requested(a));
  });
}

export function GrantTeam({ boot, session, onRefresh }) {
  const props = boot.props || [];
  const [filter, setFilter] = useState(null);   // stage key, or null = all
  const [openId, setOpenId] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [view, setView] = useState('pipeline'); // 'pipeline' | 'ongoing'

  const ongoing = useMemo(() => {
    const order = { deferred: 0 };
    return props
      .filter(p => ONGOING_STAGES.has(stageKey(p)))
      .sort((a, b) => {
        // longest-waiting first (by approval / created date), then stage order
        const da = new Date(dateOf(a)).getTime(), db = new Date(dateOf(b)).getTime();
        if (da !== db) return da - db;
        return (order[stageKey(a)] ?? 9) - (order[stageKey(b)] ?? 9);
      });
  }, [props]);

  const summary = useMemo(() => moneySummary(props, boot.bal), [props, boot.bal]);
  const { groups } = useMemo(() => byStage(props), [props]);
  const counts = k => (groups[k] ? groups[k].length : 0);

  // When a stage tile is selected we show just that stage. Otherwise the main
  // list is the ACTIVE pipeline (everything not yet funded/denied/archived);
  // the terminal outcomes drop into collapsible windows below.
  const shown = useMemo(() => sortGrants(filter ? (groups[filter] || []) : props), [props, groups, filter]);
  const active = useMemo(() => sortGrants(props.filter(p => !TERMINAL_STAGE_KEYS.includes(stageKey(p)))), [props]);

  const openGrant = openId ? props.find(p => p.id === openId) : null;

  return (
    <>
      <div class="gt-actions">
        <nav class="subtabs">
          <button class={`subtab${view === 'pipeline' ? ' on' : ''}`} onClick={() => setView('pipeline')}>Pipeline</button>
          <button class={`subtab${view === 'ongoing' ? ' on' : ''}`} onClick={() => setView('ongoing')}>
            Deferred projects{ongoing.length ? <span class="pillcount">{ongoing.length}</span> : null}
          </button>
        </nav>
        <button class="reportbtn" onClick={() => setReportOpen(true)}>📄 Foundation report</button>
      </div>

      {view === 'pipeline' && (<>
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

      {/* Pipeline funnel — the straight-through path only, ending at the money
          leaving. Deferred and Denied sit apart below with Archived. */}
      <div class="secthead">Pipeline <span class="dim">— click a stage to filter</span></div>
      <div class="funnel">
        {/* Funds transferred counts just the few in flight; Project funded
            carries the all-time total that made it through. */}
        {PIPELINE_FLOW.map((k, i) => (
          <button class={`stagetile ${k === 'funded' ? 'fs-funded' : `fs-${i}`}${filter === k ? ' on' : ''}${counts(k) ? '' : ' empty'}`} onClick={() => setFilter(filter === k ? null : k)}>
            <div class="ct">{counts(k)}</div>
            <div class="nm">{TILE_LABEL[k] || STAGE_BY_KEY[k].label}</div>
          </button>
        ))}
      </div>
      <div class="funnel term">
        {['deferred', 'denied', 'archived'].map(k => (
          <button class={`stagetile sm${filter === k ? ' on' : ''}${counts(k) ? '' : ' empty'}`} onClick={() => setFilter(filter === k ? null : k)}>
            <span class="ct">{counts(k)}</span><span class="nm">{STAGE_BY_KEY[k].label}</span>
          </button>
        ))}
        {filter && <button class="clearbtn" onClick={() => setFilter(null)}>Clear filter ✕</button>}
      </div>

      {/* Grant list */}
      {filter ? (
        <>
          <div class="secthead">{STAGE_BY_KEY[filter].label} <span class="dim">— {shown.length}</span></div>
          <GrantTable list={shown} onOpen={setOpenId} empty="No grants in this stage." />
        </>
      ) : (
        <>
          <div class="secthead">Active grants <span class="dim">— {active.length} in progress</span></div>
          <GrantTable list={active} onOpen={setOpenId} empty="No active grants right now." />

          <div class="ch-list" style="margin-top:14px">
            {TERMINAL_STAGE_KEYS.map(k => (groups[k] && groups[k].length)
              ? <GrantGroup key={k} title={STAGE_BY_KEY[k].label} list={sortGrants(groups[k])} onOpen={setOpenId} />
              : null)}
          </div>
        </>
      )}
      </>)}

      {view === 'ongoing' && <OngoingPanel list={ongoing} onOpen={setOpenId} preview={session.previewing} />}

      {openGrant && <GrantDetail p={openGrant} onClose={() => setOpenId(null)} onSaved={onRefresh} />}
      {reportOpen && <FoundationReport boot={boot} onClose={() => setReportOpen(false)} />}
    </>
  );
}

// Date a project has been waiting on funding — approval date, else created.
function dateOf(p) { const f = p.fields || {}; return f[F.proposal.dateApproved] || f[F.proposal.createdTime] || ''; }

function OngoingPanel({ list, onOpen, preview }) {
  return (
    <>
      <div class="secthead">Deferred projects <span class="dim">— {list.length} approved, waiting on funding</span></div>
      <p class="lead">These are approved but not yet funded. If money comes free, they're ready to fund. If one has waited a long time, ask whether it's still needed.</p>

      {!list.length && <div class="panel"><p style="color:var(--muted)">Nothing approved is waiting on funding right now.</p></div>}

      {list.length > 0 && (
        <div class="tablewrap">
          <table class="grants ongoing">
            <thead>
              <tr><th>Grant</th><th>Country</th><th>Coach</th><th class="r">Amount</th><th>Waiting since</th><th></th></tr>
            </thead>
            <tbody>
              {list.map(p => <OngoingRow key={p.id} p={p} onOpen={onOpen} preview={preview} />)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function OngoingRow({ p, onOpen, preview }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const amt = awarded(p) || requested(p);
  const name = projectName(p);

  async function askStillNeeded(e) {
    e.stopPropagation();
    if (preview) { setSent(true); return; }
    setBusy(true); setErr('');
    try {
      await api('update', {
        recordId: p.id, fields: {},
        changes: [{ type: 'Status change', label: 'Funding follow-up requested',
          detail: `Grant team asked Ben, Amanda and the coach whether "${name}" still needs funding` }],
        projectName: name, notify: { event: 'funding_followup' },
      });
      setSent(true);
    } catch (ex) { setErr(ex.message || 'Could not send.'); }
    setBusy(false);
  }

  return (
    <tr class="clk" onClick={() => onOpen(p.id)}>
      <td class="nm">{name}</td>
      <td class="cty">{country(p)}</td>
      <td class="cty">{coach(p) || '—'}</td>
      <td class="r">{amt ? money(amt) : '—'}</td>
      <td class="cty">{dateOf(p) ? date(dateOf(p)) : '—'}</td>
      <td class="r" onClick={e => e.stopPropagation()}>
        {sent
          ? <span class="sent-ok">✓ Asked{preview ? ' (preview)' : ''}</span>
          : <button class="mini-ask" disabled={busy} onClick={askStillNeeded} title="Message Ben, Amanda & the coach to check if this is still needed">
              {busy ? 'Sending…' : 'Ask if still needed'}
            </button>}
        {err && <div class="editerr sm">{err}</div>}
      </td>
    </tr>
  );
}

function GrantTable({ list, onOpen, empty }) {
  return (
    <div class="tablewrap">
      <table class="grants">
        <thead>
          <tr><th>Grant</th><th>Country</th><th>Coach</th><th>Stage</th><th class="r">Requested</th><th class="r">Awarded</th><th class="r">Owed</th></tr>
        </thead>
        <tbody>
          {list.map(p => (
            <tr onClick={() => onOpen(p.id)} class="clk">
              <td class="nm">{projectName(p)}</td>
              <td class="cty">{country(p)}</td>
              <td class="cty">{coach(p) || '—'}</td>
              <td><StageBadge k={stageKey(p)} /></td>
              <td class="r">{requested(p) ? money(requested(p)) : '—'}</td>
              <td class="r">{awarded(p) ? money(awarded(p)) : '—'}</td>
              <td class="r owe">{owed(p) ? money(owed(p)) : '—'}</td>
            </tr>
          ))}
          {!list.length && <tr><td colspan="7" class="empty-row">{empty || 'None.'}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// A collapsed window for a terminal outcome (Funded / Denied / Archived).
// Click the header to open it; shows the count and total awarded at a glance.
function GrantGroup({ title, list, onOpen }) {
  const [open, setOpen] = useState(false);
  const total = list.reduce((a, p) => a + awarded(p), 0);
  return (
    <div class={`ch-acc${open ? ' open' : ''}`}>
      <button class="ch-acc-head" onClick={() => setOpen(o => !o)}>
        <span class="ch-chev">{open ? '▾' : '▸'}</span>
        <span class="ch-name">{title}</span>
        <span class="ch-sub">{list.length} {list.length === 1 ? 'grant' : 'grants'}</span>
        {total ? <span class="ch-total">{money(total)}</span> : null}
      </button>
      {open && <div class="ch-acc-body"><GrantTable list={list} onOpen={onOpen} /></div>}
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
      if ((stage === 'Funded' || stage === 'Funds Transferred') && !val('dateFunded')) fields[F.proposal.dateFunded] = today();
      if (stage === 'Council Lead Team Decision' && !val('dateApproved')) fields[F.proposal.dateApproved] = today();
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
                <button type="button" class="mini" onClick={() => setAward(String(reqNum))}>
                  Requested = {money(reqNum)}
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
        {val('decisionMessage') && (
          <div class="notes">
            <div class="dt">{stageKey(p) === 'denied' ? 'Why it was denied' : 'Council decision note'}</div>
            <p>{val('decisionMessage')}</p>
          </div>
        )}

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
