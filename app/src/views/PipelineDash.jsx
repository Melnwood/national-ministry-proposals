import { useState, useMemo } from 'preact/hooks';
import { money, date, aval } from '../shared/format.js';
import { F, STAGE_BY_KEY, TRAVEL_FLOW } from '../shared/schema.js';
import { projectName, country, coach, requested, awarded, paid, stageKey, stageLabel } from '../shared/grants.js';
import { TravelTable } from './Travel.jsx';

// The straight-through pipeline: submitted → coach → council approval →
// accounting → funds transferred → project funded. Deferred and Denied are
// real outcomes but not steps on the path — they sit in their own chips
// beside the flow.
export const PIPELINE_FLOW = ['submitted', 'coach', 'council', 'accounting', 'transferred', 'funded'];
const POS = Object.fromEntries(PIPELINE_FLOW.map((k, i) => [k, i]));
export const TILE_LABEL = { transferred: 'Funds transferred', funded: 'Project funded' };
export const SIDE_KEYS = ['deferred', 'denied'];

// A deferred grant has passed council approval, so it lights the pipeline
// that far while showing in its own Deferred chip.
const lightPos = k => (k === 'deferred' ? POS.council : POS[k]);

// Cumulative pipeline dashboard, shown at the top of every workspace page.
// One green ramp, super light at Submitted and darkest at the end: a stage's
// color comes on when a grant reaches that window and never goes back off,
// so the point where color stops (and gray begins) is exactly how far things
// have gotten. Funds transferred counts just the few in flight; Project
// funded carries the all-time total.
//
// Every window is clickable, on every tab: click "6 Submitted" and those six
// open right below (view only — name, country, coach, amounts), click a row
// for the full read-only card. The list passed in is already scoped to the
// viewer (a country leader's pipeline only contains their own grants), so
// clicking only ever opens what they're allowed to see. Renders nothing when
// the viewer has no grants at all.
export function PipelineDash({ list, travel }) {
  const all = list || [];
  const tlist = travel || [];
  const [pick, setPick] = useState(null);
  const [tpick, setTpick] = useState(null); // picked SECC travel status
  const [viewP, setViewP] = useState(null);

  const counts = {};
  all.forEach(p => { const k = stageKey(p); counts[k] = (counts[k] || 0) + 1; });
  const tcounts = {};
  tlist.forEach(t => { tcounts[t.status] = (tcounts[t.status] || 0) + 1; });
  const lit = all.map(p => lightPos(stageKey(p))).filter(v => v != null);
  const hasSide = SIDE_KEYS.some(k => counts[k]);
  const picked = useMemo(() => (pick ? all.filter(p => stageKey(p) === pick) : []), [all, pick]);
  if (!lit.length && !hasSide && !tlist.length) return null;
  const furthest = lit.length ? Math.max(...lit) : -1;

  const click = k => () => { setPick(pick === k ? null : k); setTpick(null); setViewP(null); };
  const tclick = s => () => { setTpick(tpick === s ? null : s); setPick(null); setViewP(null); };

  return (
    <div class="pipedash">
      <div class="pd-title">Pipeline <span class="dim" style="font-weight:400;font-size:12px">— click a window to see what's in it</span></div>
      <div class="funnel">
        {PIPELINE_FLOW.map((k, i) => (
          <button class={`stagetile ${i <= furthest ? (k === 'funded' ? 'fs-funded' : `fs-${i}`) : 'fs-off'}${counts[k] ? '' : ' empty'}${pick === k ? ' on' : ''}`} onClick={click(k)}>
            <div class="ct">{counts[k] || 0}</div>
            <div class="nm">{TILE_LABEL[k] || STAGE_BY_KEY[k].label}</div>
          </button>
        ))}
      </div>
      {hasSide && (
        <div class="funnel term">
          {SIDE_KEYS.filter(k => counts[k]).map(k => (
            <button class={`stagetile sm${pick === k ? ' on' : ''}`} onClick={click(k)}>
              <span class="ct">{counts[k]}</span><span class="nm">{STAGE_BY_KEY[k].label}</span>
            </button>
          ))}
        </div>
      )}

      {/* The second grant program gets its own strip, same click-to-peek. */}
      {tlist.length > 0 && (
        <div class="funnel term" style="margin-top:8px;align-items:center">
          <span class="dim" style="font-size:12px;font-weight:600">SECC travel:</span>
          {TRAVEL_FLOW.filter(s => tcounts[s]).map(s => (
            <button class={`stagetile sm${tpick === s ? ' on' : ''}`} onClick={tclick(s)}>
              <span class="ct">{tcounts[s]}</span><span class="nm">{s}</span>
            </button>
          ))}
        </div>
      )}
      {tpick && (
        <div style="margin-top:12px">
          <div class="secthead" style="font-size:15px;margin:0 0 8px">SECC travel — {tpick} <span class="dim">— {tcounts[tpick] || 0}</span></div>
          <TravelTable list={tlist.filter(t => t.status === tpick)} />
        </div>
      )}

      {pick && (
        <div style="margin-top:12px">
          <div class="secthead" style="font-size:15px;margin:0 0 8px">{TILE_LABEL[pick] || STAGE_BY_KEY[pick].label} <span class="dim">— {picked.length}</span></div>
          <div class="tablewrap">
            <table class="grants">
              <thead><tr><th>Grant</th><th>Country</th><th>Coach</th><th class="r">Requested</th><th class="r">Awarded</th></tr></thead>
              <tbody>
                {picked.map(p => (
                  <tr class="clk" key={p.id} onClick={() => setViewP(p)}>
                    <td class="nm">{projectName(p)}</td>
                    <td class="cty">{country(p)}</td>
                    <td class="cty">{coach(p) || '—'}</td>
                    <td class="r">{requested(p) ? money(requested(p)) : '—'}</td>
                    <td class="r">{awarded(p) ? money(awarded(p)) : '—'}</td>
                  </tr>
                ))}
                {!picked.length && <tr><td colspan="5" class="empty-row">Nothing in this window right now.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {viewP && <ViewGrant p={viewP} onClose={() => setViewP(null)} />}
    </div>
  );
}

// Read-only look at a grant from the pipeline — everything useful, nothing
// editable. Changes happen on the owning page (Grant Team, Council, …).
export function ViewGrant({ p, onClose }) {
  const f = p.fields || {};
  const val = key => aval(f[F.proposal[key]]);
  const acct = aval(f[F.proposal.cedarstoneAccount]) || '';
  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal" onClick={e => e.stopPropagation()}>
        <div class="modal-head">
          <div>
            <span class={`badge stg-${stageKey(p)}`}>{stageLabel(p)}</span>
            <h2>{projectName(p)}</h2>
            <div class="sub2">{country(p)}{coach(p) ? ` · Coach: ${coach(p)}` : ''} · view only</div>
          </div>
          <button class="ghostbtn" onClick={onClose}>Close ✕</button>
        </div>
        <div class="dl">
          <div class="dlrow"><span class="dt">Requested</span><span class="dd">{requested(p) ? money(requested(p)) : '—'}</span></div>
          <div class="dlrow"><span class="dt">Awarded</span><span class="dd">{awarded(p) ? money(awarded(p)) : '—'}</span></div>
          <div class="dlrow"><span class="dt">Paid to date</span><span class="dd">{paid(p) ? money(paid(p)) : '—'}</span></div>
          <div class="dlrow"><span class="dt">Cedarstone account</span><span class="dd">{acct || '—'}</span></div>
          <div class="dlrow"><span class="dt">Category</span><span class="dd">{val('category') || '—'}</span></div>
          <div class="dlrow"><span class="dt">Approved</span><span class="dd">{val('dateApproved') ? date(val('dateApproved')) : '—'}</span></div>
          <div class="dlrow"><span class="dt">Date funded</span><span class="dd">{val('dateFunded') ? date(val('dateFunded')) : '—'}</span></div>
        </div>
        {val('coachNotes') && <div class="notes"><div class="dt">Coach notes</div><p>{val('coachNotes')}</p></div>}
        {val('decisionMessage') && (
          <div class="notes">
            <div class="dt">{stageKey(p) === 'denied' ? 'Why it was denied' : 'Council Lead Team note'}</div>
            <p>{val('decisionMessage')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
