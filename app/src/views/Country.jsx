import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, date, aval, daysAgo } from '../shared/format.js';
import { F, GRANT_CATEGORIES } from '../shared/schema.js';
import { projectName, country, requested, awarded, stageKey, stageLabel } from '../shared/grants.js';
import { enrichReports } from '../shared/reports.js';

const NOW = Date.now();

export function Country({ boot, session, onRefresh }) {
  // Scope to the signed-in leader's country/countries. Oversight roles (EVP)
  // see everything so they can preview what a leader sees.
  const isCountry = session.role && session.role.key === 'country';
  const myCountryIds = (session.user && session.user.countryIds) || [];

  const grants = useMemo(() => {
    let list = boot.props || [];
    if (isCountry && myCountryIds.length) {
      list = list.filter(p => {
        const link = p.fields[F.proposal.country];
        return Array.isArray(link) && link.some(id => myCountryIds.includes(id && id.id ? id.id : id));
      });
    }
    const order = ['submitted', 'coach', 'council', 'grantApproved', 'fundsFound', 'cfo', 'accounting', 'deferred', 'funded', 'denied', 'archived'];
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
          <button class="ghostbtn big" onClick={() => setApply('travel')}>Apply for a travel grant</button>
        </div>
      </div>

      <div class="secthead" style="font-size:15px">Your grants <span class="dim">— {grants.length}</span></div>
      {!grants.length && <div class="panel"><p style="color:var(--muted)">No grants on file yet — apply for one above.</p></div>}
      <div class="cards">
        {grants.map(p => <GrantStatus key={p.id} p={p} reports={reportsByProp[p.id] || []} onDone={onRefresh} />)}
      </div>

      {apply === 'project' && <ProjectGrantForm countries={countries} myCountryIds={myCountryIds} onClose={() => setApply(null)} onDone={onRefresh} />}
      {apply === 'travel' && <TravelGrantForm user={session.user} onClose={() => setApply(null)} />}
    </>
  );
}

function ProjectGrantForm({ countries, myCountryIds, onClose, onDone }) {
  const only = myCountryIds.length === 1 ? myCountryIds[0] : '';
  const [v, setV] = useState({ name: '', category: GRANT_CATEGORIES[0], requested: '', totalBudget: '',
    problem: '', people: '', leaders: '', churches: '', objective: '', success: '', sustainability: '', countryId: only });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const set = (k, val) => setV(s => ({ ...s, [k]: val }));

  async function submit() {
    if (!v.name.trim()) { setErr('Give your project a name.'); return; }
    if (!v.requested || Number(v.requested) <= 0) { setErr('Enter the amount you are requesting.'); return; }
    if (!v.countryId) { setErr('Choose your country.'); return; }
    setBusy(true); setErr('');
    try {
      await api('submit_application', { countryId: v.countryId, fields: {
        name: v.name, category: v.category, requested: v.requested, totalBudget: v.totalBudget,
        problem: v.problem, people: v.people, leaders: v.leaders, churches: v.churches,
        objective: v.objective, success: v.success, sustainability: v.sustainability } });
      setDone(true); onDone && onDone();
    } catch (e) { setErr(e.message || 'Could not submit.'); setBusy(false); }
  }

  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal" onClick={e => e.stopPropagation()}>
        <div class="modal-head"><div><h2>Apply for a project grant</h2></div><button class="ghostbtn" onClick={onClose}>Close ✕</button></div>
        {done ? (
          <div style="padding:8px 24px 24px">
            <div class="okmsg">Your application has been submitted. Your coach will review it and you'll see it in "Your grants" above.</div>
            <div class="dc-confirm"><button class="savebtn" onClick={onClose}>Done</button></div>
          </div>
        ) : (
          <div class="formbody">
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
              <Fld label="Amount requesting"><div class="moneyin"><span>$</span><input type="number" step="50" value={v.requested} onInput={e => set('requested', e.currentTarget.value)} /></div></Fld>
            </div>
            <Fld label="What problem or need does this address?"><textarea rows="2" value={v.problem} onInput={e => set('problem', e.currentTarget.value)} /></Fld>
            <div class="fldrow3">
              <Fld label="People impacted"><input type="number" value={v.people} onInput={e => set('people', e.currentTarget.value)} /></Fld>
              <Fld label="Leaders impacted"><input type="number" value={v.leaders} onInput={e => set('leaders', e.currentTarget.value)} /></Fld>
              <Fld label="Churches impacted"><input type="number" value={v.churches} onInput={e => set('churches', e.currentTarget.value)} /></Fld>
            </div>
            <div class="fldrow">
              <Fld label="Total project budget"><div class="moneyin"><span>$</span><input type="number" step="50" value={v.totalBudget} onInput={e => set('totalBudget', e.currentTarget.value)} /></div></Fld>
              <div></div>
            </div>
            <Fld label="Main objective"><textarea rows="2" value={v.objective} onInput={e => set('objective', e.currentTarget.value)} /></Fld>
            <Fld label="How will you measure success?"><textarea rows="2" value={v.success} onInput={e => set('success', e.currentTarget.value)} /></Fld>
            <Fld label="How will it continue after the grant ends?"><textarea rows="2" value={v.sustainability} onInput={e => set('sustainability', e.currentTarget.value)} /></Fld>
            {err && <div class="editerr">{err}</div>}
            <div class="modal-foot dim">A 10% grant fee is taken from the amount awarded.</div>
            <div class="dc-confirm">
              <button class="ghostbtn" onClick={onClose} disabled={busy}>Cancel</button>
              <button class="savebtn" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</button>
            </div>
          </div>
        )}
      </div>
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
      <div class="modal" onClick={e => e.stopPropagation()}>
        <div class="modal-head"><div><h2>Apply for a travel grant</h2><div class="sub2">SouthEast Christian travel fund</div></div><button class="ghostbtn" onClick={onClose}>Close ✕</button></div>
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
        <div class="dc-ctx"><span class="dt">Note from the council</span><p>{msg}</p></div>
      )}

      {reports.length > 0 && (
        <div class="reports-mini">
          <div class="dt">Reports</div>
          {reports.map(r => (
            <div class="rmini-row" key={r.id}>
              <span class={`kind ${r.kind.toLowerCase()}`}>{r.kind}</span>
              <span class={`rbadge ${r.status.key}`}>{r.status.label}</span>
              <span class="cty">{r.due ? `due ${date(r.due)}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
