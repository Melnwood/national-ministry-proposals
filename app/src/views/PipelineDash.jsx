import { STAGE_BY_KEY } from '../shared/schema.js';
import { stageKey } from '../shared/grants.js';

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
// One green ramp, super light at Submitted and darkest at Funds transferred:
// a stage's color comes on when a grant reaches that window and never goes
// back off, so the point where color stops (and gray begins) is exactly how
// far things have gotten. The end tile shows ✓, not a count — it's the proof
// grants make it all the way through. Renders nothing when the viewer has no
// grants at all (e.g. a country leader with no projects).
export function PipelineDash({ list }) {
  const all = list || [];
  const counts = {};
  all.forEach(p => { const k = stageKey(p); counts[k] = (counts[k] || 0) + 1; });
  const lit = all.map(p => lightPos(stageKey(p))).filter(v => v != null);
  const hasSide = SIDE_KEYS.some(k => counts[k]);
  if (!lit.length && !hasSide) return null;
  const furthest = lit.length ? Math.max(...lit) : -1;
  return (
    <div class="pipedash">
      <div class="pd-title">Pipeline</div>
      <div class="funnel">
        {/* Funds transferred counts just the few being worked through right
            now; Project funded carries the all-time total that made it. */}
        {PIPELINE_FLOW.map((k, i) => (
          <div class={`stagetile ro ${i <= furthest ? (k === 'funded' ? 'fs-funded' : `fs-${i}`) : 'fs-off'}${counts[k] ? '' : ' empty'}`}>
            <div class="ct">{counts[k] || 0}</div>
            <div class="nm">{TILE_LABEL[k] || STAGE_BY_KEY[k].label}</div>
          </div>
        ))}
      </div>
      {hasSide && (
        <div class="funnel term">
          {SIDE_KEYS.filter(k => counts[k]).map(k => (
            <div class="stagetile sm ro">
              <span class="ct">{counts[k]}</span><span class="nm">{STAGE_BY_KEY[k].label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
