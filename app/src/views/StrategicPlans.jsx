import { useState, useEffect } from 'preact/hooks';
import { api } from '../shared/api.js';
import { date, aval } from '../shared/format.js';
import { F } from '../shared/schema.js';
import { docxToText } from '../shared/docx.js';

// One editor for country strategic plans, used in two places: Management
// (Amanda/oversight sees every country) and My Country (a leader sees just
// theirs). Upload the .docx — the text is extracted right in the browser —
// or paste/edit by hand, then save. The saved plan powers the AI strategic
// fit check on new grant applications.
export function PlanManager({ countries, lead }) {
  const [editing, setEditing] = useState(null); // country meta row
  const [saved, setSaved] = useState({});       // countryId → 'today' after a save

  if (!countries || !countries.length) return null;
  const status = c => saved[c.id]
    ? `On file — updated ${date(saved[c.id])}`
    : (c.hasPlan ? `On file — updated ${c.planUpdated ? date(c.planUpdated) : '—'}` : 'None yet');

  return (
    <section style="margin-bottom:34px">
      <div class="secthead">Strategic plans <span class="dim">— the yearly plan each grant is judged against</span></div>
      <p class="lead">{lead || 'Upload each country\'s strategic plan for the year (.docx, or paste the text). New grant applications are automatically checked against it, and the fit shows up on the coach\'s and Council Lead Team\'s cards.'}</p>
      <div class="tablewrap">
        <table class="grants">
          <thead><tr><th>Country</th><th>Phase</th><th>Strategic plan</th><th></th></tr></thead>
          <tbody>
            {countries.map(c => (
              <tr key={c.id}>
                <td class="nm">{c.name}</td>
                <td class="cty">{c.phase || '—'}</td>
                <td class="cty">{status(c)}</td>
                <td class="r"><button class="ghostbtn" onClick={() => setEditing(c)}>{c.hasPlan || saved[c.id] ? 'View / edit' : 'Add plan'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <PlanEditor country={editing} onClose={() => setEditing(null)}
          onSaved={() => { setSaved(s => ({ ...s, [editing.id]: new Date().toISOString().slice(0, 10) })); setEditing(null); }} />
      )}
    </section>
  );
}

function PlanEditor({ country, onClose, onSaved }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    api('plan_get', { countryId: country.id })
      .then(d => { setText(d.plan || ''); setLoading(false); })
      .catch(e => { setErr(e.message || 'Could not load the plan.'); setLoading(false); });
  }, [country.id]);

  async function onFile(e) {
    const file = e.currentTarget.files && e.currentTarget.files[0];
    if (!file) return;
    setErr(''); setNote('');
    try {
      const t = /\.docx$/i.test(file.name) ? await docxToText(file) : await file.text();
      if (!t.trim()) { setErr('That file appears to be empty.'); return; }
      setText(t);
      setNote(`Loaded "${file.name}" — review below, then save.`);
    } catch (ex) { setErr(ex.message || 'Could not read that file.'); }
  }

  async function save() {
    setBusy(true); setErr('');
    try { await api('plan_save', { countryId: country.id, text }); onSaved(); }
    catch (e) { setErr(e.message || 'Could not save.'); setBusy(false); }
  }

  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal wide" onClick={e => e.stopPropagation()}>
        <div class="modal-head">
          <div><h2>{country.name} — strategic plan</h2>
            <div class="sub2">Upload the .docx or paste the text. Saved plans power the fit check on new applications.</div></div>
          <button class="ghostbtn" onClick={onClose}>Close ✕</button>
        </div>
        <div class="editor">
          <label class="filebtn" style="align-self:flex-start">
            Upload .docx / .txt…
            <input type="file" accept=".docx,.txt,text/plain" onChange={onFile} style="display:none" />
          </label>
          {note && <div class="okmsg">{note}</div>}
          <label class="fld"><span class="flbl">Plan text</span>
            <textarea rows="16" value={loading ? 'Loading…' : text} disabled={loading}
              onInput={e => setText(e.currentTarget.value)} placeholder="Paste the strategic plan here…" />
          </label>
        </div>
        {err && <div class="editerr">{err}</div>}
        <div class="modal-foot actions">
          <button class="ghostbtn" onClick={onClose} disabled={busy}>Cancel</button>
          <button class="savebtn" onClick={save} disabled={busy || loading}>{busy ? 'Saving…' : 'Save plan'}</button>
        </div>
      </div>
    </div>
  );
}

// The AI's read of how a proposal fits its country's plan — shown on the
// coach's and Council Lead Team's cards. Generated automatically on
// submission; the button re-runs it (e.g. after a new plan is uploaded, or
// for older/deferred projects submitted before this existed).
export function FitBox({ p }) {
  const [local, setLocal] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const text = local || aval(p.fields[F.proposal.fitCheck]) || '';

  async function run() {
    setBusy(true); setErr('');
    try {
      const d = await api('fit_check', { recordId: p.id });
      if (d.needsKey) { setErr('The AI key is not configured on the server yet.'); }
      else setLocal(d.fit || '');
    } catch (e) { setErr(e.message || 'Could not run the check.'); }
    finally { setBusy(false); }
  }

  return (
    <div class="fitbox">
      <div class="fitbox-head">
        <span class="dt">Strategic fit — AI read, not the decision</span>
        <button type="button" class="mini" disabled={busy} onClick={run}>{busy ? 'Checking…' : (text ? 'Re-run' : 'Run fit check')}</button>
      </div>
      {err && <div class="editerr">{err}</div>}
      {text
        ? <p class="fittext">{text}</p>
        : <p class="muted" style="font-size:12.5px;margin:4px 0 0">No fit check yet — it runs automatically on new applications once the country's strategic plan is on file.</p>}
    </div>
  );
}
