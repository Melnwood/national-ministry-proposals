import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, date, aval, daysAgo } from '../shared/format.js';
import { F, GRANT_CATEGORIES, REQUEST_TYPES, APPLICANT_CHECKLIST, YESNO, YESNO_MPD } from '../shared/schema.js';
import { projectName, country, requested, awarded, stageKey, stageLabel } from '../shared/grants.js';
import { enrichReports } from '../shared/reports.js';
import { PipelineDash } from './PipelineDash.jsx';
import { PlanManager } from './StrategicPlans.jsx';

const NOW = Date.now();

export function Country({ boot, session, onRefresh }) {
  // Scope to the signed-in leader's country/countries. Oversight roles (EVP)
  // see everything so they can preview what a leader sees.
  const isCountry = session.role && session.role.key === 'country';
  const myCountryIds = (session.user && session.user.countryIds) || [];

  const grants = useMemo(() => {
    let list = boot.props || [];
    if (isCountry && myCountryIds.length && !session.previewing) {
      list = list.filter(p => {
        const link = p.fields[F.proposal.country];
        return Array.isArray(link) && link.some(id => myCountryIds.includes(id && id.id ? id.id : id));
      });
    }
    const order = ['submitted', 'coach', 'council', 'cfo', 'accounting', 'transferred', 'deferred', 'funded', 'denied', 'archived'];
    return [...list].sort((a, b) => order.indexOf(stageKey(a)) - order.indexOf(stageKey(b)));
  }, [boot.props, isCountry]);

  const reportsByProp = useMemo(() => {
    const map = {};
    enrichReports(boot.reports || [], boot.props || [], NOW).forEach(r => {
      (map[r.proposalId] = map[r.proposalId] || []).push(r);
    });
    return map;
  }, [boot.reports, boot.props]);

  const [apply, setApply] = useState(null); // 'project' | 'travel' | null
  const countries = boot.countries_meta || [];

  return (
    <>
      <div class="applybar">
        <div>
          <div class="secthead" style="margin:0">Your country</div>
          <p class="lead" style="margin:4px 0 0">Apply for a grant, track what you've submitted, and keep deferred projects alive.</p>
        </div>
        <div class="applybtns">
          <button class="btn-approve" onClick={() => setApply('project')}>Apply for a project grant</button>
          <button class="ghostbtn big" onClick={() => setApply('travel')}>Apply for the SECC Travel Grant</button>
        </div>
      </div>

      <PipelineDash list={grants} />

      <div class="secthead" style="font-size:15px">Your grants <span class="dim">— {grants.length}</span></div>
      {!grants.length && <div class="panel"><p style="color:var(--muted)">No grants on file yet — apply for one above.</p></div>}
      <div class="cards">
        {grants.map(p => <GrantStatus key={p.id} p={p} reports={reportsByProp[p.id] || []} onDone={onRefresh} />)}
      </div>

      <PlanManager countries={countries}
        lead="Your country's strategic plan for the year. Keep it current — every grant you apply for is checked against it, and the fit is what the coach and Council Lead Team see first." />

      {apply === 'project' && <ProjectGrantForm countries={countries} myCountryIds={myCountryIds} onClose={() => setApply(null)} onDone={onRefresh} />}
      {apply === 'travel' && <TravelGrantForm user={session.user} onClose={() => setApply(null)} />}
    </>
  );
}

const EMPTY_APP = {
  name: '', category: GRANT_CATEGORIES[0], requestType: '', team: '', projectLead: '', start: '', end: '',
  problem: '', people: '', leaders: '', churches: '',
  requested: '', totalBudget: '', otherFunding: '', receivedFunds: '', unusedFunds: '', cedarstoneAccount: '',
  objective: '', objective2: '', objective3: '',
  strategicFit: '', success: '', sustainability: '', checklist: [], budgetFile: null,
};

function ProjectGrantForm({ countries, myCountryIds, onClose, onDone }) {
  const only = myCountryIds.length === 1 ? myCountryIds[0] : '';
  const [v, setV] = useState({ ...EMPTY_APP, countryId: only });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [step, setStep] = useState('form'); // 'form' → 'assessment'
  const set = (k, val) => setV(s => ({ ...s, [k]: val }));
  const toggleCheck = c => setV(s => ({ ...s, checklist: s.checklist.includes(c) ? s.checklist.filter(x => x !== c) : [...s.checklist, c] }));

  // Clicking submit validates the questionnaire, then opens the assessment gate.
  function goAssess() {
    if (!v.name.trim()) { setErr('Give your project a name.'); return; }
    if (!v.requested || Number(v.requested) <= 0) { setErr('Enter the amount you are requesting.'); return; }
    if (!v.countryId) { setErr('Choose your country.'); return; }
    setErr(''); setStep('assessment');
  }
  function onBudgetFile(e) {
    const file = e.currentTarget.files && e.currentTarget.files[0];
    if (!file) { set('budgetFile', null); return; }
    if (file.size > 8 * 1024 * 1024) { setErr('Budget file must be under 8 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => set('budgetFile', { filename: file.name, contentType: file.type, data: String(reader.result).split(',')[1] });
    reader.readAsDataURL(file);
  }

  async function finalSubmit() {
    if (!v.checklist.length) { setErr('Choose the ones that apply — this is required.'); return; }
    setBusy(true); setErr('');
    try {
      await api('submit_application', { countryId: v.countryId, fields: v, budgetFile: v.budgetFile });
      setDone(true); onDone && onDone();
    } catch (e) { setErr(e.message || 'Could not submit.'); setBusy(false); }
  }

  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal wide" onClick={e => e.stopPropagation()}>
        <div class="modal-head"><div><h2>Apply for a project grant</h2></div><button class="ghostbtn" onClick={onClose}>Close ✕</button></div>
        {done ? (
          <div style="padding:8px 24px 24px">
            <div class="okmsg">Your application has been submitted. Your coach will review it and you'll see it in "Your grants" above.</div>
            <div class="dc-confirm"><button class="savebtn" onClick={onClose}>Done</button></div>
          </div>
        ) : (
          <div class="formbody">
            <div class="formsec">The basics</div>
            {myCountryIds.length !== 1 && (
              <Fld label="Country"><select value={v.countryId} onChange={e => set('countryId', e.currentTarget.value)}>
                <option value="">— choose —</option>
                {countries.map(c => <option value={c.id}>{c.name}</option>)}
              </select></Fld>
            )}
            <Fld label="Project name"><input value={v.name} onInput={e => set('name', e.currentTarget.value)} placeholder="What are you calling it?" /></Fld>
            <div class="fldrow">
              <Fld label="Category"><select value={v.category} onChange={e => set('category', e.currentTarget.value)}>
                {GRANT_CATEGORIES.map(c => <option value={c}>{c}</option>)}</select></Fld>
              <Fld label="Impact area"><select value={v.requestType} onChange={e => set('requestType', e.currentTarget.value)}>
                <option value="">— choose —</option>
                {REQUEST_TYPES.map(t => <option value={t}>{t.trim()}</option>)}</select></Fld>
            </div>
            <div class="fldrow">
              <Fld label="Team or department"><input value={v.team} onInput={e => set('team', e.currentTarget.value)} /></Fld>
              <Fld label="Project lead"><input value={v.projectLead} onInput={e => set('projectLead', e.currentTarget.value)} /></Fld>
            </div>
            <div class="fldrow">
              <Fld label="Start date"><input type="date" value={v.start} onInput={e => set('start', e.currentTarget.value)} /></Fld>
              <Fld label="End date"><input type="date" value={v.end} onInput={e => set('end', e.currentTarget.value)} /></Fld>
            </div>

            <div class="formsec">The need &amp; who it reaches</div>
            <Fld label="What specific problem or need does this project address?"><textarea rows="2" value={v.problem} onInput={e => set('problem', e.currentTarget.value)} /></Fld>
            <div class="fldrow3">
              <Fld label="People impacted"><input type="number" value={v.people} onInput={e => set('people', e.currentTarget.value)} /></Fld>
              <Fld label="Leaders impacted"><input type="number" value={v.leaders} onInput={e => set('leaders', e.currentTarget.value)} /></Fld>
              <Fld label="Churches impacted"><input type="number" value={v.churches} onInput={e => set('churches', e.currentTarget.value)} /></Fld>
            </div>

            <div class="formsec">Budget</div>
            <div class="fldrow">
              <Fld label="Amount requesting from the grant"><div class="moneyin"><span>$</span><input type="number" step="50" value={v.requested} onInput={e => set('requested', e.currentTarget.value)} /></div></Fld>
              <Fld label="Total project budget"><div class="moneyin"><span>$</span><input type="number" step="50" value={v.totalBudget} onInput={e => set('totalBudget', e.currentTarget.value)} /></div></Fld>
            </div>
            <Fld label="JV account number at Cedarstone — where the money goes if approved">
              <input value={v.cedarstoneAccount} onInput={e => set('cedarstoneAccount', e.currentTarget.value)} placeholder="e.g. 510xxx" />
            </Fld>
            <Fld label="Other sources of funding for this project (if any)"><textarea rows="2" value={v.otherFunding} onInput={e => set('otherFunding', e.currentTarget.value)} /></Fld>
            <Fld label="Detailed budget breakdown (optional file)">
              <input type="file" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*" onChange={onBudgetFile} />
              {v.budgetFile && <span class="mini dim">Attached: {v.budgetFile.filename}</span>}
            </Fld>
            <div class="fldrow">
              <Fld label="Received funds for this (or a similar) project in the last 2 years?"><select value={v.receivedFunds} onChange={e => set('receivedFunds', e.currentTarget.value)}>
                <option value="">—</option>{YESNO.map(o => <option value={o}>{o}</option>)}</select></Fld>
              <Fld label="Have unused funds from other projects?"><select value={v.unusedFunds} onChange={e => set('unusedFunds', e.currentTarget.value)}>
                <option value="">—</option>{YESNO_MPD.map(o => <option value={o}>{o}</option>)}</select></Fld>
            </div>

            <div class="formsec">Objectives</div>
            <Fld label="Objective 1"><textarea rows="2" value={v.objective} onInput={e => set('objective', e.currentTarget.value)} /></Fld>
            <Fld label="Objective 2"><textarea rows="2" value={v.objective2} onInput={e => set('objective2', e.currentTarget.value)} /></Fld>
            <Fld label="Objective 3"><textarea rows="2" value={v.objective3} onInput={e => set('objective3', e.currentTarget.value)} /></Fld>

            <div class="formsec">The plan</div>
            <Fld label="How does this project fit into your strategic plans?"><textarea rows="2" value={v.strategicFit} onInput={e => set('strategicFit', e.currentTarget.value)} /></Fld>
            <Fld label="How will the success of the project be measured?"><textarea rows="2" value={v.success} onInput={e => set('success', e.currentTarget.value)} /></Fld>
            <Fld label="How will the project be sustained after the grant ends?"><textarea rows="2" value={v.sustainability} onInput={e => set('sustainability', e.currentTarget.value)} /></Fld>

            {step === 'form' && err && <div class="editerr">{err}</div>}
            <div class="dc-confirm" style="margin-top:16px">
              <button class="ghostbtn" onClick={onClose}>Cancel</button>
              <button class="savebtn" onClick={goAssess}>Submit application</button>
            </div>
          </div>
        )}
      </div>

      {step === 'assessment' && !done && (
        <div class="modal-scrim" onClick={() => setStep('form')}>
          <div class="modal" onClick={e => e.stopPropagation()}>
            <div class="modal-head"><div><h2>Your assessment</h2><div class="sub2">Before you submit, tell us how this measures up.</div></div><button class="ghostbtn" onClick={() => setStep('form')}>Back</button></div>
            <div class="formbody">
              <div class="checklist">
                {APPLICANT_CHECKLIST.map(c => (
                  <label class={`check${v.checklist.includes(c) ? ' on' : ''}`} key={c}>
                    <input type="checkbox" checked={v.checklist.includes(c)} onChange={() => toggleCheck(c)} /><span>{c}</span>
                  </label>
                ))}
              </div>
              {err && <div class="editerr">{err}</div>}
              <div class="dc-confirm" style="margin-top:16px">
                <button class="ghostbtn" onClick={() => setStep('form')} disabled={busy}>Back</button>
                <button class="savebtn" onClick={finalSubmit} disabled={busy || !v.checklist.length}>{busy ? 'Submitting…' : 'Confirm & submit'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TravelGrantForm({ user, onClose }) {
  const [v, setV] = useState({ name: (user && user.name) || '', email: (user && user.email) || '', team: '',
    purpose: '', timing: 'Upcoming', depart: '', ret: '', reqAmt: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const set = (k, val) => setV(s => ({ ...s, [k]: val }));

  async function submit() {
    if (!v.name.trim() || !v.email.trim()) { setErr('Add your name and email.'); return; }
    if (!v.purpose.trim()) { setErr('Tell us what the trip is for.'); return; }
    if (!v.reqAmt || Number(v.reqAmt) <= 0) { setErr('Enter the amount you are requesting.'); return; }
    setBusy(true); setErr('');
    try {
      await api('travel_submit', { fields: {
        name: v.name, email: v.email, team: v.team, purpose: v.purpose, timing: v.timing,
        depart: v.depart, ret: v.ret, reqAmt: Number(v.reqAmt),
        actualCost: v.timing === 'Already taken' ? Number(v.reqAmt) : '', notes: v.notes } });
      setDone(true);
    } catch (e) { setErr(e.message || 'Could not submit.'); setBusy(false); }
  }

  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal wide" onClick={e => e.stopPropagation()}>
        <div class="modal-head"><div><h2>Apply for the SECC Travel Grant</h2><div class="sub2">SouthEast Christian travel fund</div></div><button class="ghostbtn" onClick={onClose}>Close ✕</button></div>
        {done ? (
          <div style="padding:8px 24px 24px">
            <div class="okmsg">Your travel request has been submitted for review.</div>
            <div class="dc-confirm"><button class="savebtn" onClick={onClose}>Done</button></div>
          </div>
        ) : (
          <div class="formbody">
            <Fld label="Have you already taken this trip?"><select value={v.timing} onChange={e => set('timing', e.currentTarget.value)}>
              <option value="Upcoming">No — it's upcoming</option><option value="Already taken">Yes — already taken</option></select></Fld>
            <div class="fldrow">
              <Fld label="Your name"><input value={v.name} onInput={e => set('name', e.currentTarget.value)} /></Fld>
              <Fld label="Email"><input type="email" value={v.email} onInput={e => set('email', e.currentTarget.value)} /></Fld>
            </div>
            <Fld label="Country / team"><input value={v.team} onInput={e => set('team', e.currentTarget.value)} placeholder="e.g. Czech Republic" /></Fld>
            <Fld label="What is the trip for?"><textarea rows="2" value={v.purpose} onInput={e => set('purpose', e.currentTarget.value)} /></Fld>
            <div class="fldrow">
              <Fld label={v.timing === 'Already taken' ? 'Trip start' : 'Depart date'}><input type="date" value={v.depart} onInput={e => set('depart', e.currentTarget.value)} /></Fld>
              <Fld label={v.timing === 'Already taken' ? 'Trip end' : 'Return date'}><input type="date" value={v.ret} onInput={e => set('ret', e.currentTarget.value)} /></Fld>
            </div>
            <Fld label={v.timing === 'Already taken' ? 'What did the trip cost?' : 'Amount requested'}><div class="moneyin"><span>$</span><input type="number" step="50" value={v.reqAmt} onInput={e => set('reqAmt', e.currentTarget.value)} /></div></Fld>
            <Fld label="Anything else we should know?"><textarea rows="2" value={v.notes} onInput={e => set('notes', e.currentTarget.value)} /></Fld>
            {err && <div class="editerr">{err}</div>}
            <div class="dc-confirm">
              <button class="ghostbtn" onClick={onClose} disabled={busy}>Cancel</button>
              <button class="savebtn" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Fld({ label, children }) {
  return <label class="fld"><span class="flbl">{label}</span>{children}</label>;
}

function GrantStatus({ p, reports, onDone }) {
  const f = p.fields || {};
  const val = key => aval(f[F.proposal[key]]);
  const skey = stageKey(p);
  const msg = val('decisionMessage');
  const [busy, setBusy] = useState(false);
  const [fill, setFill] = useState(null); // the report being filled out

  const lastConfirmed = val('lastConfirmed');
  const confirmedDays = daysAgo(lastConfirmed);
  const stale = confirmedDays == null || confirmedDays > 90;

  async function confirmStillWant() {
    setBusy(true);
    try {
      await api('update', {
        recordId: p.id,
        fields: { [F.proposal.lastConfirmed]: new Date().toISOString().slice(0, 10) },
        changes: [{ type: 'Status change', label: 'Country confirmed', detail: `${projectName(p)} — country confirmed they still want this project` }],
        projectName: projectName(p),
      });
      onDone && onDone();
    } catch (e) { setBusy(false); }
  }

  return (
    <div class={`dcard${skey === 'denied' ? ' denied' : ''}`}>
      <div class="dc-head">
        <div>
          <h3>{projectName(p)}</h3>
          <div class="dc-meta">{country(p)} · {awarded(p) ? `${money(awarded(p))} awarded` : `${money(requested(p))} requested`}</div>
        </div>
        <span class={`badge stg-${skey}`}>{stageLabel(p)}</span>
      </div>

      {skey === 'denied' && (
        <div class="denybanner">
          <div class="dt">This grant was declined</div>
          <p>{msg || 'No reason was recorded.'}</p>
        </div>
      )}

      {skey === 'deferred' && (
        <div class="deferbox">
          <div>
            <div class="dt">Approved — waiting for funding</div>
            <p>{msg ? msg + ' ' : ''}This project is approved but not yet funded. Confirm monthly that you still want it, or it drops off the active list.</p>
            <div class={`confirmnote${stale ? ' stale' : ''}`}>
              {lastConfirmed ? `Last confirmed ${date(lastConfirmed)}${stale ? ' — please reconfirm' : ''}` : 'Not yet confirmed'}
            </div>
          </div>
          <button class="savebtn" disabled={busy} onClick={confirmStillWant}>{busy ? 'Saving…' : 'Yes — still want it'}</button>
        </div>
      )}

      {msg && skey !== 'denied' && skey !== 'deferred' && (
        <div class="dc-ctx"><span class="dt">Note from the Council Lead Team</span><p>{msg}</p></div>
      )}

      {reports.length > 0 && (
        <div class="reports-mini">
          <div class="dt">Reports</div>
          {reports.map(r => (
            <div class="rmini-row" key={r.id}>
              <span class={`kind ${r.kind.toLowerCase()}`}>{r.kind}</span>
              <span class={`rbadge ${r.status.key}`}>{r.status.label}</span>
              <span class="cty">{r.due ? `due ${date(r.due)}` : ''}</span>
              {!r.done && <button class="mini" onClick={() => setFill(r)}>Fill out report ▸</button>}
            </div>
          ))}
        </div>
      )}

      {fill && <ReportForm r={fill} p={p} midReport={reports.find(x => x.kind === 'Mid' && x.done)}
        onClose={() => setFill(null)} onDone={() => { setFill(null); onDone && onDone(); }} />}
    </div>
  );
}

// The mid/final project report, filled right here in the app — this is what
// feeds the impact numbers on the Foundations tab and the donor reports.
// The mid report shows what the application promised; the final also shows
// the mid-point update, so the country writes against their own trajectory.
function ReportForm({ r, p, midReport, onClose, onDone }) {
  const [v, setV] = useState({ spent: '', people: '', leaders: '', churches: '', story: '', challenges: '', lessons: '', nextSteps: '' });
  const set = (k, val) => setV(prev => ({ ...prev, [k]: val }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!v.story.trim()) { setErr('Tell the story — even a few sentences. This is what goes to the foundations who gave the money.'); return; }
    setBusy(true); setErr('');
    try {
      await api('report_submit', { reportId: r.id, fields: v, projectName: projectName(p) });
      onDone();
    } catch (e) { setErr(e.message || 'Could not submit the report.'); setBusy(false); }
  }

  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal wide" onClick={e => e.stopPropagation()}>
        <div class="modal-head">
          <div><h2>{r.kind}-project report — {projectName(p)}</h2>
            <div class="sub2">{r.due ? `Due ${date(r.due)} · ` : ''}Your words here feed the impact story we send the foundations behind this grant.</div></div>
          <button class="ghostbtn" onClick={onClose}>Close ✕</button>
        </div>

        {/* What the application promised — the report is written against this. */}
        <div class="fullapp" style="margin:0 24px">
          <div class="dt">What you set out to do</div>
          {[aval(p.fields[F.proposal.objective]), aval(p.fields[F.proposal.objective2]), aval(p.fields[F.proposal.objective3])].filter(Boolean).map((o, i) => (
            <p style="margin:6px 0 0;font-size:13px"><b>Objective {i + 1}:</b> {o}</p>
          ))}
          {aval(p.fields[F.proposal.success]) && <p style="margin:6px 0 0;font-size:13px"><b>Success looks like:</b> {aval(p.fields[F.proposal.success])}</p>}
          <p style="margin:6px 0 0;font-size:13px"><b>Impact targets:</b> {aval(p.fields[F.proposal.peopleImpact]) || 0} people · {aval(p.fields[F.proposal.leadersImpact]) || 0} leaders · {aval(p.fields[F.proposal.churchesImpact]) || 0} churches</p>
        </div>

        {/* On the final report, their own mid-point update sits right above
            what they're about to write. */}
        {r.kind === 'Final' && midReport && (
          <div class="fullapp" style="margin:10px 24px 0">
            <div class="dt">Your mid-project update{midReport.submitted ? ` — ${date(midReport.submitted)}` : ''}</div>
            <p style="margin:6px 0 0;font-size:13px"><b>Reported then:</b> {midReport.people || 0} people · {midReport.leaders || 0} leaders · {midReport.churches || 0} churches{midReport.spent ? ` · ${money(midReport.spent)} spent` : ''}</p>
            {midReport.story && <p style="margin:6px 0 0;font-size:13px"><b>Story:</b> {midReport.story}</p>}
            {midReport.challenges && <p style="margin:6px 0 0;font-size:13px"><b>Challenges:</b> {midReport.challenges}</p>}
            {midReport.lessons && <p style="margin:6px 0 0;font-size:13px"><b>Lessons:</b> {midReport.lessons}</p>}
          </div>
        )}

        <div class="editor">
          <div class="fldrow">
            <label class="fld"><span class="flbl">Spent so far</span>
              <div class="moneyin"><span>$</span><input type="number" step="50" value={v.spent} onInput={e => set('spent', e.currentTarget.value)} /></div></label>
            <label class="fld"><span class="flbl">People impacted</span>
              <input type="number" value={v.people} onInput={e => set('people', e.currentTarget.value)} /></label>
          </div>
          <div class="fldrow">
            <label class="fld"><span class="flbl">Leaders impacted</span>
              <input type="number" value={v.leaders} onInput={e => set('leaders', e.currentTarget.value)} /></label>
            <label class="fld"><span class="flbl">Churches impacted</span>
              <input type="number" value={v.churches} onInput={e => set('churches', e.currentTarget.value)} /></label>
          </div>
          <label class="fld"><span class="flbl">The story — what has God done through this project so far?</span>
            <textarea rows="5" value={v.story} onInput={e => set('story', e.currentTarget.value)} placeholder="A moment, a person, a change you saw…" /></label>
          <label class="fld"><span class="flbl">Challenges you hit</span>
            <textarea rows="3" value={v.challenges} onInput={e => set('challenges', e.currentTarget.value)} /></label>
          <label class="fld"><span class="flbl">Lessons learned</span>
            <textarea rows="3" value={v.lessons} onInput={e => set('lessons', e.currentTarget.value)} /></label>
          <label class="fld"><span class="flbl">Next steps</span>
            <textarea rows="2" value={v.nextSteps} onInput={e => set('nextSteps', e.currentTarget.value)} /></label>
        </div>
        {err && <div class="editerr">{err}</div>}
        <div class="modal-foot actions">
          <button class="ghostbtn" onClick={onClose} disabled={busy}>Cancel</button>
          <button class="savebtn" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button>
        </div>
      </div>
    </div>
  );
}
