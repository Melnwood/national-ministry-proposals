import { useState, useMemo, useEffect } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, date, aval, daysAgo } from '../shared/format.js';
import { F, GRANT_CATEGORIES, REQUEST_TYPES, APPLICANT_CHECKLIST, YESNO, YESNO_MPD, ACC_SEASONS, ACC_ITEMS, ACC_STATUSES, nextAccDue, STAGE_BY_KEY } from '../shared/schema.js';
import { projectName, country, requested, awarded, stageKey, stageLabel } from '../shared/grants.js';
import { enrichReports } from '../shared/reports.js';
import { shrinkImage } from '../shared/img.js';
import { PipelineDash } from './PipelineDash.jsx';
import { PlanManager } from './StrategicPlans.jsx';
import { TravelTable } from './Travel.jsx';

const NOW = Date.now();

export function Country({ boot, session, onRefresh }) {
  // Scope to the signed-in leader's country/countries. Oversight roles (EVP)
  // see everything so they can preview what a leader sees. A coach who ALSO
  // leads a country (Peter, Josh) is scoped here to the country they LEAD
  // (Leads Countries), not the countries they coach.
  const isCountry = (session.role && session.role.key === 'country') || (session.roleKeys || []).includes('country');
  const leadIds = (session.user && session.user.leadsCountryIds) || [];
  const myCountryIds = leadIds.length ? leadIds : ((session.user && session.user.countryIds) || []);

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

  // If they saved a half-finished application, the button invites them back.
  const draftKey = `jv-app-draft:${(session.user && session.user.email) || 'anon'}`;
  const hasDraft = useMemo(() => {
    try { return !!localStorage.getItem(draftKey); } catch (e) { return false; }
  }, [draftKey, apply]);

  // The leader's own SECC travel requests, so a submitted request is never a
  // black hole — they see its status here just like their project grants.
  // (The server already scopes boot.travel to their own for country leaders;
  // the email match keeps it personal for oversight roles previewing.)
  const myEmail = ((session.user && session.user.email) || '').trim().toLowerCase();
  const myTravel = useMemo(
    () => (boot.travel || []).filter(t => (t.email || '').trim().toLowerCase() === myEmail),
    [boot.travel, myEmail]
  );

  // ── The leader's to-do picture: reports to file, decisions pending, and
  // JV Covenant accountability still open this year ──
  const accYear = String(new Date().getFullYear());
  const accCountries = useMemo(() => {
    const all = countries;
    return myCountryIds.length ? all.filter(c => myCountryIds.includes(c.id)) : all;
  }, [countries, myCountryIds]);
  const todo = useMemo(() => {
    const reps = grants.flatMap(p => reportsByProp[p.id] || []);
    const overdue = reps.filter(r => r.status.key === 'overdue').length;
    const dueSoon = reps.filter(r => r.status.key === 'due-soon').length;
    const waiting = grants.filter(p => ['submitted', 'coach', 'council'].includes(stageKey(p))).length;
    return { overdue, dueSoon, waiting };
  }, [grants, reportsByProp]);

  // Grants grouped by where they are in the process — each group an accordion,
  // shut by default (per Mel). The group header carries a report flag so a
  // closed section never hides a deadline.
  const grantGroups = useMemo(() => {
    const order = ['submitted', 'coach', 'council', 'accounting', 'transferred', 'deferred', 'funded', 'denied', 'archived'];
    const m = {};
    grants.forEach(p => { const k = order.includes(stageKey(p)) ? stageKey(p) : 'other'; (m[k] = m[k] || []).push(p); });
    const groups = order.filter(k => m[k]).map(k => ({ key: k, label: STAGE_BY_KEY[k].label, list: m[k] }));
    if (m.other) groups.push({ key: 'other', label: 'Other', list: m.other });
    return groups.map(g => ({
      ...g,
      total: g.list.reduce((a, p) => a + (awarded(p) || requested(p) || 0), 0),
      reportFlags: g.list.reduce((a, p) => a + (reportsByProp[p.id] || [])
        .filter(r => r.status.key === 'overdue' || r.status.key === 'due-soon').length, 0),
    }));
  }, [grants, reportsByProp]);

  // The NEXT board deadline, and how that country stands against it — this is
  // what pops up on the dashboard with enough runway to get things done.
  const accDue = useMemo(() => {
    const next = nextAccDue();
    const firstCty = accCountries[0];
    if (!next || !firstCty) return null;
    const dueYear = String(next.due.getFullYear());
    const mine = (boot.acc || []).filter(a => a.countryId === firstCty.id && a.year === dueYear);
    const ok = new Set(mine.filter(a => a.status === 'Yes' || a.status === 'N/A').map(a => a.item));
    const open = next.season.items.filter(i => !ok.has(i.key)).length;
    return { ...next, open, dueIso: next.due.toISOString().slice(0, 10) };
  }, [boot.acc, accCountries]);

  return (
    <>
      <div class="applybar">
        <div>
          <div class="secthead" style="margin:0">Your country</div>
          <p class="lead" style="margin:4px 0 0">Apply for a grant, track what you've submitted, and keep deferred projects alive.</p>
        </div>
        <div class="applybtns">
          <button class="btn-approve" onClick={() => setApply('project')}>{hasDraft ? 'Continue your application ▸' : 'Apply for a project grant'}</button>
          <button class="ghostbtn big" onClick={() => setApply('travel')}>Apply for the SECC Travel Grant</button>
        </div>
      </div>

      {/* The leader's dashboard: what needs their attention right now. */}
      <section class="money">
        <div class="mtile">
          <div class="mlbl">Reports to file</div>
          <div class={`mval${todo.overdue ? ' neg' : ''}`}>{todo.overdue + todo.dueSoon}</div>
          <div class="mnote">{todo.overdue ? `${todo.overdue} overdue · ` : ''}{todo.dueSoon} due within 30 days</div>
        </div>
        <div class="mtile">
          <div class="mlbl">Waiting on a decision</div>
          <div class="mval">{todo.waiting}</div>
          <div class="mnote">Submitted, in coach review, or with the council</div>
        </div>
        <div class="mtile mtile-link" role="button" tabindex="0" title="Jump to the accountability section"
          onClick={() => { const el = document.getElementById('acc-section'); el && el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
          <div class="mlbl">{accDue ? `Accountability — ${accDue.season.short}` : 'Accountability'}</div>
          <div class={`mval${accDue && accDue.open && accDue.days <= 21 ? ' neg' : ''}`}>{accDue ? accDue.open : '—'}</div>
          <div class="mnote">{accDue
            ? (accDue.open
              ? `${accDue.open === 1 ? 'item' : 'items'} to finish · due ${date(accDue.dueIso)} — ${accDue.days} ${accDue.days === 1 ? 'day' : 'days'} left`
              : `All done — due ${date(accDue.dueIso)}`)
            : 'JV Covenant items'} · <b>click to work on it ↓</b></div>
        </div>
      </section>

      {/* Pops up with runway: the season banner, only inside its window. */}
      {accDue && accDue.inWindow && accDue.open > 0 && (
        <div class="cycle-note" style="margin:0 0 14px">
          ⏰ <b>{accDue.season.short} is coming</b> — {accDue.open} accountability {accDue.open === 1 ? 'item' : 'items'} to
          finish by <b>{date(accDue.dueIso)}</b> ({accDue.days} {accDue.days === 1 ? 'day' : 'days'} left).
          The season is open below — upload the documents and mark each item off.
        </div>
      )}

      <PipelineDash list={grants} travel={myTravel} />

      <div class="secthead" style="font-size:15px">Your grants <span class="dim">— {grants.length} · click a section to open it</span></div>
      {!grants.length && <div class="panel"><p style="color:var(--muted)">No grants on file yet — apply for one above.</p></div>}
      <div class="ch-list">
        {grantGroups.map(g => (
          <Fold key={g.key} title={g.label}
            dim={`— ${g.list.length} ${g.list.length === 1 ? 'grant' : 'grants'}${g.reportFlags ? ` · ⚠ ${g.reportFlags} ${g.reportFlags === 1 ? 'report' : 'reports'} to file` : ''}`}
            right={g.total ? <span class="ch-total">{money(g.total)}</span> : null}>
            <div class="ch-list">
              {g.list.map(p => (
                <GrantFold key={p.id} p={p} reports={reportsByProp[p.id] || []}>
                  <GrantStatus p={p} reports={reportsByProp[p.id] || []} onDone={onRefresh} />
                </GrantFold>
              ))}
            </div>
          </Fold>
        ))}
      </div>

      {myTravel.length > 0 && (
        <div class="ch-list" style="margin-top:14px">
          <Fold title="Your SECC travel requests" dim={`— ${myTravel.length}`}>
            <p class="lead">Submitted goes to the Council Lead Team; once approved, accounting pays it from the SouthEast travel fund and you'll get an email when the money is sent.</p>
            <TravelTable list={myTravel} />
          </Fold>
        </div>
      )}

      {accCountries.length > 0 && (
        <div id="acc-section" style="scroll-margin-top:16px">
          <Accountability countries={accCountries} acc={boot.acc || []} year={accYear} accDue={accDue} onRefresh={onRefresh} />
        </div>
      )}

      <div class="ch-list" style="margin:14px 0 34px">
        <Fold title="Your strategic plan" dim="— every application is checked against it">
          <p class="lead">Your country's strategic plan for the year. Keep it current — every grant you apply for is checked against it, and the fit is what the coach and Council Lead Team see first.</p>
          <PlanManager countries={countries} noHead lead=" " />
        </Fold>
      </div>

      {apply === 'project' && <ProjectGrantForm countries={countries} myCountryIds={myCountryIds}
        draftKey={draftKey} onClose={() => setApply(null)} onDone={onRefresh} />}
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
  photoCommit: false,
};

// A saved-but-not-submitted application, kept in this browser's localStorage so
// a leader can close the form (or lose their connection) and pick up where they
// left off. The attached budget file is NOT saved — files are too big for
// localStorage — so a restored draft asks them to re-attach it.
function loadDraft(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

function ProjectGrantForm({ countries, myCountryIds, draftKey, onClose, onDone }) {
  const only = myCountryIds.length === 1 ? myCountryIds[0] : '';
  const saved = useMemo(() => loadDraft(draftKey), [draftKey]);
  const [v, setV] = useState(saved
    ? { ...EMPTY_APP, countryId: only, ...saved, budgetFile: null }
    : { ...EMPTY_APP, countryId: only });
  const [restored, setRestored] = useState(!!saved);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [step, setStep] = useState('form'); // 'form' → 'assessment'
  const set = (k, val) => setV(s => ({ ...s, [k]: val }));

  // Save progress automatically as they type (everything except the file).
  useEffect(() => {
    if (done) return;
    try {
      const { budgetFile, ...rest } = v;
      localStorage.setItem(draftKey, JSON.stringify(rest));
    } catch (e) { /* storage full or blocked — form still works, just no draft */ }
  }, [v, done]);

  function startFresh() {
    try { localStorage.removeItem(draftKey); } catch (e) {}
    setV({ ...EMPTY_APP, countryId: only });
    setRestored(false);
  }
  const toggleCheck = c => setV(s => ({ ...s, checklist: s.checklist.includes(c) ? s.checklist.filter(x => x !== c) : [...s.checklist, c] }));

  // Clicking submit validates the questionnaire, then opens the assessment gate.
  function goAssess() {
    if (!v.name.trim()) { setErr('Give your project a name.'); return; }
    if (!v.requested || Number(v.requested) <= 0) { setErr('Enter the amount you are requesting.'); return; }
    if (!v.countryId) { setErr('Choose your country.'); return; }
    if (!v.photoCommit) { setErr('Please check the photo commitment — the reports can\'t be filed without the photos, so we ask you to plan for them now.'); return; }
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
      try { localStorage.removeItem(draftKey); } catch (ex) {} // submitted — the draft is done
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
            {restored && (
              <div class="okmsg" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span>Welcome back — your saved progress is restored.{saved && saved.name ? ` (“${saved.name}”)` : ''} If you had a budget file attached, please re-attach it.</span>
                <button type="button" class="mini" onClick={startFresh}>Start fresh instead</button>
              </div>
            )}
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

            <div class="formsec">Telling the story</div>
            <p class="lead" style="margin:0 0 8px;font-size:13px">If this grant is funded, you'll file a mid-project and a final report in this app — and each one requires <b>3 different photos</b> of the project (6 meaningful photos in all). They help us tell the story of what God did and how we stewarded the grant, and that goes a long way with the foundations and churches that give to support what you're doing. Plan now to capture them as the project runs.</p>
            <label class={`check${v.photoCommit ? ' on' : ''}`}>
              <input type="checkbox" checked={v.photoCommit} onChange={e => set('photoCommit', e.currentTarget.checked)} />
              <span>We will provide 6 meaningful photos of the project — 3 different ones with the mid-term report and 3 different ones with the final report.</span>
            </label>

            {step === 'form' && err && <div class="editerr">{err}</div>}
            <div class="dc-confirm" style="margin-top:16px;align-items:center">
              <span class="mini dim" style="margin-right:auto">✓ Progress saves automatically on this device — close and come back anytime.</span>
              <button class="ghostbtn" onClick={onClose}>Save &amp; close</button>
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
    purpose: '', timing: 'Upcoming', depart: '', ret: '', reqAmt: '', acct: '', notes: '' });
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
        depart: v.depart, ret: v.ret, reqAmt: Number(v.reqAmt), acct: v.acct,
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
            <Fld label="Your JV account number at Cedarstone — where we send the money if approved"><input value={v.acct} onInput={e => set('acct', e.currentTarget.value)} placeholder="e.g. 510xxx" /></Fld>
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
  const [photos, setPhotos] = useState([]); // [{filename, contentType, data, preview}]
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function onPhotos(e) {
    const files = Array.from(e.currentTarget.files || []);
    e.currentTarget.value = '';
    setErr('');
    for (const f of files) {
      if (photos.length + files.indexOf(f) >= 3) break;
      try {
        const shrunk = await shrinkImage(f);
        setPhotos(prev => (prev.length >= 3 ? prev : [...prev, shrunk]));
      } catch (ex) { setErr(ex.message || 'Could not read that photo.'); }
    }
  }

  async function submit() {
    if (!v.story.trim()) { setErr('Tell the story — even a few sentences. This is what goes to the foundations who gave the money.'); return; }
    if (photos.length !== 3) { setErr(`Add your 3 best photos of the project (you have ${photos.length}). They go straight into the foundation report.`); return; }
    setBusy(true); setErr('');
    try {
      await api('report_submit', { reportId: r.id, fields: v, projectName: projectName(p),
        photos: photos.map(({ filename, contentType, data }) => ({ filename, contentType, data })) });
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
            {Array.isArray(midReport.photos) && midReport.photos.length > 0 && (
              <div style="margin-top:8px">
                <div class="dt">Photos you sent at mid-term — pick 3 different ones below</div>
                <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
                  {midReport.photos.map(ph => <img src={ph.thumb} alt={ph.filename} style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid var(--line)" />)}
                </div>
              </div>
            )}
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

          <label class="fld">
            <span class="flbl">Your 3 best photos of the project — required{r.kind === 'Final' ? ' (different from the mid-term ones)' : ''}</span>
            <p class="lead" style="margin:2px 0 8px;font-size:13px">These photos help us tell the story of what God did and how we stewarded the grant we were given — and that goes a long way with the foundations and churches that give to support what you're doing.</p>
            <input type="file" accept="image/*" multiple onChange={onPhotos} disabled={photos.length >= 3} />
            <span class="mini dim">{photos.length} of 3 added</span>
          </label>
          {photos.length > 0 && (
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
              {photos.map((ph, i) => (
                <div style="position:relative">
                  <img src={ph.preview} alt={ph.filename} style="width:92px;height:92px;object-fit:cover;border-radius:10px;border:1px solid var(--line-d)" />
                  <button type="button" class="mini" style="position:absolute;top:4px;right:4px;padding:2px 7px"
                    onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
          )}
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

// ── JV COVENANT ACCOUNTABILITY ──────────────────────────────────────────────────
// The board's chart, from the leader's side: three seasons, each with its
// items. For every item the leader marks Yes / In progress / N/A, and for
// document items they upload the actual latest version — so "when was the
// handbook last updated?" is answered by the handbook itself, with its date.

// A closed-by-default accordion (same look as the Grant Team groups). Per Mel:
// nothing on this page sits open — you click what you want to see.
function Fold({ title, dim, right, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div class={`ch-acc${open ? ' open' : ''}`}>
      <button class="ch-acc-head" onClick={() => setOpen(o => !o)}>
        <span class="ch-chev">{open ? '▾' : '▸'}</span>
        <span class="ch-name">{title}</span>
        {dim && <span class="ch-sub">{dim}</span>}
        {right}
      </button>
      {open && <div class="ch-acc-body">{children}</div>}
    </div>
  );
}

// One grant, folded shut: name, country, stage, amount — and a flag when a
// report is overdue or coming due, so nothing gets missed while closed.
function GrantFold({ p, reports, children }) {
  const amt = awarded(p) || requested(p);
  const alert = reports.some(r => r.status.key === 'overdue') ? '⚠ report overdue'
    : reports.some(r => r.status.key === 'due-soon') ? '⏳ report due soon' : '';
  return (
    <Fold
      title={projectName(p)}
      dim={`${country(p)}${alert ? ` · ${alert}` : ''}`}
      right={<>
        <span class={`badge stg-${stageKey(p)}`}>{stageLabel(p)}</span>
        {amt ? <span class="ch-total">{money(amt)}</span> : null}
      </>}
    >
      {children}
    </Fold>
  );
}

function readFileB64(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(new Error('Could not read the file.'));
    fr.readAsDataURL(file);
  });
}

function Accountability({ countries, acc, year, accDue, onRefresh }) {
  const [ctyId, setCtyId] = useState(countries[0] && countries[0].id);
  const cty = countries.find(c => c.id === ctyId) || countries[0];
  if (!cty) return null;

  const rows = acc.filter(a => a.countryId === cty.id && a.year === year);
  const byItem = Object.fromEntries(rows.map(r => [r.item, r]));
  const done = ACC_ITEMS.filter(i => { const r = byItem[i.key]; return r && (r.status === 'Yes' || r.status === 'N/A'); }).length;
  // The season whose deadline is inside its window opens by itself — that's
  // the "pop up at the right time". Everything else stays shut.
  const activeSeason = accDue && accDue.inWindow ? accDue.season.key : null;

  return (
    <>
      <div class="secthead" style="margin-top:26px">
        JV Covenant accountability — {year} <span class="dim">— {done} of {ACC_ITEMS.length} done · click a season to open it</span>
      </div>
      <p class="lead">
        Mark each item, and for documents upload the <b>latest version</b> — JV sees exactly what you
        upload, with the date it was last updated.
      </p>
      {countries.length > 1 && (
        <label class="fld" style="max-width:280px;margin-bottom:12px">
          <span class="flbl">Country</span>
          <select value={ctyId} onChange={e => setCtyId(e.currentTarget.value)}>
            {countries.map(c => <option value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <div class="ch-list">
        {ACC_SEASONS.map(s => {
          const sDone = s.items.filter(i => { const r = byItem[i.key]; return r && (r.status === 'Yes' || r.status === 'N/A'); }).length;
          const isActive = s.key === activeSeason;
          const dueTxt = isActive ? `due ${date(accDue.dueIso)} · ${accDue.days} ${accDue.days === 1 ? 'day' : 'days'} left` : '';
          const allDone = sDone >= s.items.length;
          return (
            <Fold key={s.key + cty.id} defaultOpen={isActive}
              title={s.label}
              dim={`— ${sDone} of ${s.items.length} done${dueTxt ? ` · ${dueTxt}` : ''}`}
              right={allDone
                ? <span class="accpill ok">✓ Done</span>
                : <span class="accpill todo">{s.items.length - sDone} to do</span>}>
              <p class="lead" style="margin:0 0 10px">{s.blurb}</p>
              {s.items.map(i => (
                <AccRow key={i.key} item={i} rec={byItem[i.key]} cty={cty} year={year} onRefresh={onRefresh} />
              ))}
            </Fold>
          );
        })}
      </div>
    </>
  );
}

function AccRow({ item, rec, cty, year, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function setStatus(st) {
    setBusy(true); setErr('');
    // Clicking the button that's already on un-does the choice.
    const clearing = rec && rec.status === st;
    try {
      await api('acc_set', { countryId: cty.id, countryName: cty.name, year, item: item.key,
        ...(clearing ? { clearStatus: true } : { status: st }) });
      onRefresh && onRefresh();
    } catch (e) { setErr(e.message || 'Could not save.'); }
    setBusy(false);
  }

  async function upload(e) {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!f) return;
    if (f.size > 4.5 * 1024 * 1024) { setErr('That file is too big — keep it under 4.5 MB (a PDF works well).'); return; }
    setBusy(true); setErr('');
    try {
      const data = await readFileB64(f);
      await api('acc_set', { countryId: cty.id, countryName: cty.name, year, item: item.key,
        file: { filename: f.name, contentType: f.type || 'application/octet-stream', data } });
      onRefresh && onRefresh();
    } catch (ex) { setErr(ex.message || 'Could not upload.'); }
    setBusy(false);
  }

  const st = rec && rec.status;
  const itemDone = st === 'Yes' || st === 'N/A';
  const latest = rec && rec.files && rec.files.length ? rec.files[rec.files.length - 1] : null;
  return (
    <div class="accrow">
      <div class="accmain">
        <div class="accname"><span class={`accdot ${itemDone ? 'ok' : 'todo'}`}></span>{item.label}</div>
        <div class="accmeta">
          {latest && <a href={latest.url} target="_blank" rel="noopener">📎 {latest.filename}</a>}
          {rec && rec.updated
            ? <span class="dim">{latest ? ' · ' : ''}updated {date(rec.updated)}{rec.by ? ` by ${rec.by}` : ''}</span>
            : <span class="dim">Nothing on file yet{item.upload ? ' — upload the latest version' : ''}</span>}
        </div>
      </div>
      <div class="accacts">
        {ACC_STATUSES.map(s => (
          <button key={s} disabled={busy} onClick={() => setStatus(s)}
            class={`accst a-${s === 'Yes' ? 'yes' : s === 'In Progress' ? 'prog' : 'na'}${st === s ? ' on' : ''}`}>
            {s === 'In Progress' ? 'In progress' : s}
          </button>
        ))}
        {item.upload && (
          <label class="accup">
            {busy ? 'Saving…' : '⬆ Upload'}
            <input type="file" style="display:none" onChange={upload} disabled={busy} />
          </label>
        )}
      </div>
      {err && <div class="editerr sm" style="flex-basis:100%">{err}</div>}
    </div>
  );
}
