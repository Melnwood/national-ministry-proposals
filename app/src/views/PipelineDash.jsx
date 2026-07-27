import { STAGE_BY_KEY, ACTIVE_STAGE_KEYS } from '../shared/schema.js';
import { stageKey } from '../shared/grants.js';

// The pipeline runs all the way to the money leaving the building.
const FLOW = [...ACTIVE_STAGE_KEYS, 'funded'];
const POS = Object.fromEntries(FLOW.map((k, i) => [k, i]));

// Cumulative pipeline dashboard, shown at the top of every workspace page.
// Tiles light up and STAY lit as grants move through — everything up to the
// furthest-along grant is colored, stages not yet reached stay grayed out,
// and the final tile goes green when funds have been transferred. Denied and
// archived grants don't light the pipeline. Renders nothing when the viewer
// has no grants in the pipeline at all.
export function PipelineDash({ list }) {
  const inFlow = (list || []).filter(p => POS[stageKey(p)] != null);
  if (!inFlow.length) return null;
  const counts = {};
  inFlow.forEach(p => { const k = stageKey(p); counts[k] = (counts[k] || 0) + 1; });
  const furthest = Math.max(...inFlow.map(p => POS[stageKey(p)]));
  return (
    <div class="pipedash">
      <div class="pd-title">Pipeline</div>
      <div class="funnel">
        {FLOW.map((k, i) => (
          <div class={`stagetile ro ${i <= furthest ? (k === 'funded' ? 'fs-funded' : `fs-${i}`) : 'fs-off'}${counts[k] || k === 'funded' ? '' : ' empty'}`}>
            {/* The end tile isn't a count — it's the proof that grants make it
                all the way through: a check once anything has, gray until then. */}
            <div class="ct">{k === 'funded' ? (counts[k] ? '✓' : '·') : (counts[k] || 0)}</div>
            <div class="nm">{k === 'funded' ? 'Funds transferred' : STAGE_BY_KEY[k].label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
