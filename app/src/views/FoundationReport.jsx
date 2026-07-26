import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money } from '../shared/format.js';
import { buildFoundations } from '../shared/foundations.js';

// A foundation-facing stewardship report: pick a foundation + grant cycle and
// generate a clean, printable report showing how their gift was used and the
// impact it made possible — the numbers plus the country teams' own stories and
// photos, with an optional AI-written thank-you narrative pulled from all the
// reports. A built-in sample lets the team see the finished shape before any
// real report data is in.
export function FoundationReport({ boot, onClose }) {
  const foundations = useMemo(
    () => buildFoundations(boot.cycles || [], boot.goals || [], boot.props || []),
    [boot.cycles, boot.goals, boot.props]
  );

  const [foundation, setFoundation] = useState(foundations[0] ? foundations[0].foundation : '');
  const picked = foundations.find(f => f.foundation === foundation) || foundations[0];
  const cycles = picked ? picked.cycles : [];
  const [cycleId, setCycleId] = useState(cycles[0] ? cycles[0].id : '');

  const [mode, setMode] = useState('pick');   // 'pick' | 'report' | 'sample'
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);

  function chooseFoundation(name) {
    setFoundation(name);
    const f = foundations.find(x => x.foundation === name);
    setCycleId(f && f.cycles[0] ? f.cycles[0].id : '');
  }

  async function generate() {
    if (!cycleId) { setErr('Pick a grant cycle first.'); return; }
    setLoading(true); setErr('');
    try {
      const r = await api('cycle_report', { cycleId });
      setData(r);
      setMode('report');
    } catch (e) { setErr(e.message || 'Could not build the report.'); }
    setLoading(false);
  }

  return (
    <div class="report-scrim" onClick={onClose}>
      <div class="report-wrap" onClick={e => e.stopPropagation()}>
        <div class="report-bar noprint">
          {mode === 'pick'
            ? <span class="rb-title">Foundation impact report</span>
            : <button class="ghostbtn" onClick={() => setMode('pick')}>← Choose another</button>}
          <div class="rb-right">
            {mode !== 'pick' && <button class="savebtn" onClick={() => window.print()}>🖨 Print / Save PDF</button>}
            <button class="ghostbtn" onClick={onClose}>Close ✕</button>
          </div>
        </div>

        {mode === 'pick' && (
          <div class="report-picker">
            <h2>Report to a foundation</h2>
            <p class="lead">Choose a foundation and grant cycle. We'll pull together how their gift was used and the impact it made possible — the numbers and the stories from the field. New to this? <button class="linkbtn" onClick={() => setMode('sample')}>See a finished example →</button></p>

            <label class="fld">
              <span class="flbl">Foundation</span>
              <select value={foundation} onChange={e => chooseFoundation(e.currentTarget.value)}>
                {foundations.map(f => <option value={f.foundation}>{f.foundation}</option>)}
              </select>
            </label>

            <label class="fld">
              <span class="flbl">Grant cycle</span>
              <select value={cycleId} onChange={e => setCycleId(e.currentTarget.value)}>
                {cycles.map(c => <option value={c.id}>{c.year || '(cycle)'} · gift {money(c.gift)} · {c.grantCount} projects</option>)}
                {!cycles.length && <option value="">No cycles for this foundation</option>}
              </select>
            </label>

            {err && <div class="editerr">{err}</div>}
            <div class="picker-actions">
              <button class="savebtn big" disabled={loading || !cycleId} onClick={generate}>
                {loading ? 'Building report…' : 'Generate report'}
              </button>
              <button class="ghostbtn big" onClick={() => setMode('sample')}>See an example</button>
            </div>
          </div>
        )}

        {mode === 'sample' && (
          <>
            <div class="sample-ribbon noprint">Sample — fictional foundation &amp; figures, so you can see what a finished report looks like</div>
            <ReportDoc data={SAMPLE} cycleId="sample" />
          </>
        )}

        {mode === 'report' && data && <ReportDoc data={data} cycleId={cycleId} />}
      </div>
    </div>
  );
}

function ReportDoc({ data, cycleId }) {
  const { cycle, totals, goals, projects, stories } = data;
  const funded = projects.filter(p => p.stage === 'Funded');

  const [summary, setSummary] = useState(data.summary || '');
  const [sumBusy, setSumBusy] = useState(false);
  const [sumErr, setSumErr] = useState('');
  const [needsKey, setNeedsKey] = useState(false);

  async function writeSummary() {
    setSumBusy(true); setSumErr(''); setNeedsKey(false);
    try {
      const r = await api('cycle_summary', { cycleId, data });
      if (r.needsKey) setNeedsKey(true);
      else setSummary(r.summary || '');
    } catch (e) { setSumErr(e.message || 'Could not write the summary.'); }
    setSumBusy(false);
  }

  return (
    <div class="reportpage">
      <header class="rp-head">
        <div class="rp-mark">JV</div>
        <div class="rp-org">Josiah Venture · National Ministries</div>
        <h1>Impact Report</h1>
        <div class="rp-for">Prepared for <b>{cycle.foundation}</b>{cycle.year ? ` · ${cycle.year}` : ''}</div>
      </header>

      <p class="rp-intro">
        Thank you for partnering with us. Your gift of <b>{money(cycle.gift)}</b> helped fund national ministry
        across Central &amp; Eastern Europe. Here is what it made possible.
      </p>

      <section class="rp-tiles">
        <Tile n={totals.fundedCount} l="Projects funded" />
        <Tile n={totals.countryCount} l={totals.countryCount === 1 ? 'Country reached' : 'Countries reached'} />
        <Tile n={money(totals.awarded)} l="Awarded to projects" />
        <Tile n={num(totals.leaders)} l="Leaders impacted" />
        <Tile n={num(totals.churches)} l="Churches impacted" />
        <Tile n={num(totals.people)} l="People impacted" />
      </section>

      {data.countries && data.countries.length > 0 && (
        <p class="rp-countries"><span class="dt">Countries served</span> {data.countries.join(' · ')}</p>
      )}

      {goals && goals.length > 0 && (
        <section class="rp-sec">
          <h2>Goals for this cycle</h2>
          <table class="rp-goals">
            <thead><tr><th>Goal</th><th class="r">Target</th><th class="r">Actual so far</th><th class="r">Progress</th></tr></thead>
            <tbody>
              {goals.map(g => {
                const pct = g.target ? Math.round((g.actual / g.target) * 100) : 0;
                return (
                  <tr>
                    <td>{g.type}</td>
                    <td class="r">{num(g.target)}</td>
                    <td class="r"><b>{num(g.actual)}</b></td>
                    <td class="r">
                      <div class="rp-barwrap"><div class={`rp-bar${pct >= 100 ? ' over' : ''}`} style={`width:${Math.min(pct, 100)}%`} /></div>
                      <span class="rp-pct">{pct}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section class="rp-sec">
        <div class="rp-sec-head">
          <h2>The impact your gift made possible</h2>
          {!summary && !needsKey && !data.sample && (
            <button class="ghostbtn noprint" disabled={sumBusy} onClick={writeSummary}>
              {sumBusy ? 'Writing…' : '✨ Draft with AI'}
            </button>
          )}
        </div>
        {summary
          ? summary.split(/\n{2,}/).map(para => <p class="rp-summary">{para}</p>)
          : needsKey
            ? <p class="rp-note noprint">The AI draft needs an Anthropic API key added in Netlify (like the email key). Until then, the stories below are pulled straight from the field reports and you can write the summary yourself.</p>
            : <p class="rp-note noprint">Click <b>Draft with AI</b> to turn the field reports below into a warm summary you can send — or write your own using the stories.</p>}
        {sumErr && <div class="editerr noprint">{sumErr}</div>}
      </section>

      {stories && stories.length > 0 && (
        <section class="rp-sec">
          <h2>Stories from the field</h2>
          {stories.map(s => (
            <article class="rp-story">
              <div class="rp-story-head">
                <b>{s.name}</b>{s.country ? <span class="rp-cty"> · {s.country}</span> : null}
                {s.kind ? <span class="rp-kind">{s.kind} report</span> : null}
              </div>
              {s.story && <p class="rp-lead-para">{s.story}</p>}
              {s.photos && s.photos.length > 0 && (
                <div class="rp-photos">
                  {s.photos.slice(0, 3).map(ph => ph === 'sample'
                    ? <div class="rp-photo ph"><span>photo</span></div>
                    : <img class="rp-photo" src={ph} alt="" loading="lazy" />)}
                </div>
              )}
              {s.objectives && s.objectives.map(o => <p class="rp-obj">{o}</p>)}
              {s.lessons && <p class="rp-mini"><span class="dt">Lessons learned</span> {s.lessons}</p>}
              {s.challenges && <p class="rp-mini"><span class="dt">Challenges</span> {s.challenges}</p>}
              {(s.leaders || s.churches || s.people) ? (
                <div class="rp-story-nums">
                  {s.leaders ? <span>{num(s.leaders)} leaders</span> : null}
                  {s.churches ? <span>{num(s.churches)} churches</span> : null}
                  {s.people ? <span>{num(s.people)} people</span> : null}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}

      {funded.length > 0 && (
        <section class="rp-sec">
          <h2>Projects funded this cycle</h2>
          <table class="rp-projects">
            <thead><tr><th>Project</th><th>Country</th><th class="r">Awarded</th></tr></thead>
            <tbody>
              {funded.map(p => (
                <tr><td>{p.name}</td><td>{p.country}</td><td class="r">{money(p.awarded)}</td></tr>
              ))}
              <tr class="rp-total"><td colspan="2"><b>Total awarded</b></td><td class="r"><b>{money(totals.awarded)}</b></td></tr>
            </tbody>
          </table>
        </section>
      )}

      <footer class="rp-foot">
        With gratitude for your partnership in the gospel across Central &amp; Eastern Europe.
        <div class="rp-org2">Josiah Venture · National Ministries</div>
      </footer>
    </div>
  );
}

function Tile({ n, l }) {
  return <div class="rp-tile"><div class="rp-tile-n">{n}</div><div class="rp-tile-l">{l}</div></div>;
}

const num = n => (Number(n) || 0).toLocaleString('en-US');

// A worked example so the team can see the finished shape before real report
// data exists. Fictional foundation and figures. Photos are placeholder tiles.
const SAMPLE = {
  sample: true,
  cycle: { foundation: 'Cornerstone Foundation', year: '2025–26', gift: 250000 },
  totals: { awarded: 218500, projectCount: 14, fundedCount: 11, countryCount: 8, leaders: 1240, churches: 96, people: 18400 },
  countries: ['Croatia', 'Czechia', 'Estonia', 'Hungary', 'Poland', 'Romania', 'Slovakia', 'Slovenia'],
  goals: [
    { type: 'Projects funded', target: 12, actual: 11 },
    { type: 'Leaders impacted', target: 1000, actual: 1240 },
    { type: 'Churches impacted', target: 120, actual: 96 },
  ],
  summary: `This year your partnership reached further than a set of numbers can hold. Because of Cornerstone Foundation's gift, eleven projects moved from hope to reality across eight countries — and behind each one are people whose lives look different than they did twelve months ago. We are deeply grateful, and we want you to see what your generosity set in motion.

In Poland, an expanded summer camp welcomed 640 students, nearly double the year before. Forty-one of them made first-time commitments to follow Jesus, and today a dozen are meeting in small groups led by students who came to faith at that same camp two years ago. In Romania, a cohort of six church planters is now meeting monthly; two have launched public gatherings, one of them in a town that had no evangelical church within thirty miles.

The teams were honest about the hard parts too — a permit delay nearly shortened the Polish camp, and planters in smaller Romanian towns are still searching for affordable places to meet. But in report after report the same note keeps sounding: leaders raised up, churches strengthened, and a gospel that keeps reaching new places. Across the funded work, 1,240 leaders, 96 churches, and more than 18,000 people have been touched so far.

None of this would have happened without you. Thank you for standing with the national leaders of this region and for trusting us to steward what you gave.`,
  projects: [
    { name: 'Youth Camp Expansion', country: 'Poland', awarded: 42000, stage: 'Funded' },
    { name: 'Church Planting Cohort', country: 'Romania', awarded: 38000, stage: 'Funded' },
    { name: 'Worship Training Hub', country: 'Czechia', awarded: 25000, stage: 'Funded' },
    { name: 'Leadership Intensive', country: 'Hungary', awarded: 22500, stage: 'Funded' },
    { name: 'Campus Outreach Network', country: 'Slovakia', awarded: 19000, stage: 'Funded' },
    { name: 'Family Camp Weekend', country: 'Croatia', awarded: 16000, stage: 'Funded' },
    { name: 'Student Discipleship Cohort', country: 'Estonia', awarded: 14000, stage: 'Funded' },
    { name: 'Regional Prayer Network', country: 'Slovenia', awarded: 12500, stage: 'Funded' },
    { name: 'Media Discipleship Studio', country: 'Hungary', awarded: 11000, stage: 'Funded' },
    { name: 'Rural Church Revitalization', country: 'Romania', awarded: 9500, stage: 'Funded' },
    { name: 'Worship Nights Initiative', country: 'Poland', awarded: 9000, stage: 'Funded' },
  ],
  stories: [
    {
      name: 'Youth Camp Expansion', country: 'Poland', kind: 'Final',
      story: 'This summer 640 students came through the expanded camp — nearly double last year. Forty-one made first-time commitments, and a dozen are already in follow-up small groups led by students who came to faith at camp two years ago.',
      photos: ['sample', 'sample', 'sample'],
      objectives: ['Objective 1 — Run 3 camp weeks: all three ran at full capacity.'],
      lessons: 'Recruiting local student leaders early was the single biggest factor in follow-up sticking.',
      challenges: 'A late permit delay compressed the build timeline, but volunteers finished the cabins in time.',
      leaders: 55, churches: 8, people: 640,
    },
    {
      name: 'Church Planting Cohort', country: 'Romania', kind: 'Mid',
      story: 'Six planters are now meeting monthly. Two have launched public gatherings; one in a town with no evangelical church for thirty miles.',
      photos: ['sample', 'sample'],
      objectives: [], lessons: '',
      challenges: 'Finding affordable meeting space in smaller towns remains the hardest part.',
      leaders: 6, churches: 2, people: 180,
    },
  ],
};
