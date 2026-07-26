import { useState, useMemo } from 'preact/hooks';
import { signOut } from '../shared/auth.js';
import { money, date, aval } from '../shared/format.js';
import { STAGES, STAGE_BY_KEY, ACTIVE_STAGE_KEYS, TERMINAL_STAGE_KEYS, F } from '../shared/schema.js';
import { moneySummary, byStage, projectName, country, requested, awarded, paid, owed, stageKey } from '../shared/grants.js';

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
            <tr><th>Grant</th><th>Country</th><th>Stage</th><th class="r">Requested</th><th class="r">Awarded</th><th class="r">Owed</th></tr>
          </thead>
          <tbody>
            {shown.map(p => (
              <tr onClick={() => setOpenId(p.id)} class="clk">
                <td class="nm">{projectName(p)}</td>
                <td class="cty">{country(p)}</td>
                <td><StageBadge k={stageKey(p)} /></td>
                <td class="r">{requested(p) ? money(requested(p)) : '—'}</td>
                <td class="r">{awarded(p) ? money(awarded(p)) : '—'}</td>
                <td class="r owe">{owed(p) ? money(owed(p)) : '—'}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colspan="6" class="empty-row">No grants in this stage.</td></tr>}
          </tbody>
        </table>
      </div>

      {openGrant && <GrantDetail p={openGrant} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function StageBadge({ k }) {
  const s = STAGE_BY_KEY[k];
  if (!s) return <span class="badge">—</span>;
  return <span class={`badge stg-${k}`}>{s.label}</span>;
}

function GrantDetail({ p, onClose }) {
  const f = p.fields || {};
  const val = key => aval(f[F.proposal[key]]);
  const rows = [
    ['Country', country(p)],
    ['Requested', requested(p) ? money(requested(p)) : '—'],
    ['Awarded', awarded(p) ? money(awarded(p)) : '—'],
    ['Paid to date', paid(p) ? money(paid(p)) : '—'],
    ['Still owed', owed(p) ? money(owed(p)) : '—'],
    ['Category', val('category') || '—'],
    ['Priority', val('priority') || '—'],
    ['Coach', val('assignedCoach') || val('coachNotes') ? (val('assignedCoach') || '—') : '—'],
    ['Start', val('startDate') ? date(val('startDate')) : '—'],
    ['End', val('endDate') ? date(val('endDate')) : '—'],
    ['Date funded', val('dateFunded') ? date(val('dateFunded')) : '—'],
  ];
  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal" onClick={e => e.stopPropagation()}>
        <div class="modal-head">
          <div>
            <StageBadge k={stageKey(p)} />
            <h2>{projectName(p)}</h2>
          </div>
          <button class="ghostbtn" onClick={onClose}>Close ✕</button>
        </div>
        <div class="dl">
          {rows.map(([k, v]) => <div class="dlrow"><span class="dt">{k}</span><span class="dd">{v}</span></div>)}
        </div>
        {val('coachNotes') && (
          <div class="notes"><div class="dt">Coach notes</div><p>{val('coachNotes')}</p></div>
        )}
        <div class="modal-foot dim">Actions (advance stage, set award, record transfer) come next — this is the read view.</div>
      </div>
    </div>
  );
}
