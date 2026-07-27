import { useState, useEffect } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, moneyCents, date } from '../shared/format.js';
import { parseBankCSV } from '../shared/csv.js';
import { ROLES } from '../shared/schema.js';
import { PlanManager } from './StrategicPlans.jsx';

export function Management({ boot, onRefresh }) {
  return (
    <>
      <Reconcile boot={boot} onRefresh={onRefresh} />
      <Fold title="People & access" dim="— roles, countries, and sign-ins">
        <SignIns boot={boot} noHead />
      </Fold>
      <Fold title="Strategic plans" dim="— the yearly plan each grant is judged against">
        <PlanManager countries={boot.countries_meta || []} noHead />
      </Fold>
    </>
  );
}

// A closed-by-default accordion section — click the header to open it.
function Fold({ title, dim, children }) {
  const [open, setOpen] = useState(false);
  return (
    <section style="margin-bottom:18px">
      <button type="button" class="foldhead" onClick={() => setOpen(o => !o)}>
        <span class="secthead" style="margin:0">{title} <span class="dim">{dim}</span></span>
        <span class="dc-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style="margin-top:14px">{children}</div>}
    </section>
  );
}

function Reconcile({ boot, onRefresh }) {
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const bal = boot.bal || null;

  function onFile(e) {
    const file = e.currentTarget.files && e.currentTarget.files[0];
    if (!file) return;
    setErr(''); setMsg(''); setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = parseBankCSV(String(reader.result));
        if (!p.count) { setErr('No transactions found in that file.'); setParsed(null); return; }
        setParsed(p);
      } catch (e) { setErr('Could not read that file.'); setParsed(null); }
    };
    reader.readAsText(file);
  }

  async function apply() {
    if (!parsed || parsed.balance == null) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await api('set_balance', { balance: parsed.balance, asOf: parsed.asOf, note: `Reconciled from ${fileName}` });
      setMsg(`Balance updated to ${money(parsed.balance)} as of ${date(parsed.asOf)}.`);
      onRefresh && onRefresh();
    } catch (e) { setErr(e.message || 'Could not update the balance.'); }
    finally { setBusy(false); }
  }

  return (
    <section style="margin-bottom:34px">
      <div class="secthead">Reconcile <span class="dim">— monthly CSV from account 510181</span></div>
      <p class="lead">Download the transactions CSV from Cedarstone and drop it here. It reads the latest balance and shows where the money went, so the “available to grant” figure stays honest.</p>

      <div class="panel">
        <div class="curbal">
          <div><div class="mlbl">Current balance on file</div>
            <div class="mval">{bal ? money(bal.balance) : '—'}</div>
            <div class="mnote">{bal && bal.asOf ? `as of ${date(bal.asOf)}` : 'no balance recorded'}</div>
          </div>
          <label class="filebtn">
            Choose CSV…
            <input type="file" accept=".csv,text/csv" onChange={onFile} style="display:none" />
          </label>
        </div>

        {err && <div class="editerr" style="margin-top:14px">{err}</div>}
        {msg && <div class="okmsg">{msg}</div>}

        {parsed && (
          <div class="reconcile">
            <div class="rec-summary">
              <Stat label="New balance" val={money(parsed.balance)} big />
              <Stat label="As of" val={date(parsed.asOf)} />
              <Stat label="Transactions" val={parsed.count} />
              <Stat label="Total out" val={money(parsed.totalOut)} />
            </div>
            <div class="dc-confirm" style="margin:12px 0 4px">
              <span class="dim" style="margin-right:auto;align-self:center">{fileName}</span>
              <button class="savebtn" disabled={busy} onClick={apply}>{busy ? 'Updating…' : `Update balance to ${money(parsed.balance)}`}</button>
            </div>
            <div class="tablewrap" style="margin-top:8px">
              <table class="grants">
                <thead><tr><th>Date</th><th>Description</th><th class="r">Out</th><th class="r">In</th><th class="r">Balance</th></tr></thead>
                <tbody>
                  {parsed.txns.slice(0, 40).map((t, i) => (
                    <tr key={i}>
                      <td class="cty">{date(t.date)}</td>
                      <td>{t.description}{/no detail|internal transfer/i.test(t.description) && !/trf to|to [a-z]/i.test(t.description) ? <span class="flag-mini">no detail</span> : ''}</td>
                      <td class="r owe">{t.debit ? moneyCents(t.debit) : ''}</td>
                      <td class="r ok">{t.credit ? moneyCents(t.credit) : ''}</td>
                      <td class="r cty">{moneyCents(t.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.count > 40 && <p class="dim" style="margin-top:8px">Showing 40 of {parsed.count} transactions.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

const ROLE_LABEL = Object.fromEntries(Object.values(ROLES).map(r => [r.airtable, r.label]));

function SignIns({ boot, noHead }) {
  const [people, setPeople] = useState(null);
  const [err, setErr] = useState('');
  const [resetting, setResetting] = useState(null);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(null); // a person, or { __new:true }

  async function load() {
    try { const d = await api('people_list', {}); setPeople(d.people || []); }
    catch (e) { setErr(e.message || 'Could not load people.'); }
  }
  useEffect(() => { load(); }, []);

  async function reset(p) {
    if (!confirm(`Reset the sign-in for ${p.name || p.email}? They'll set a new password next time they sign in.`)) return;
    setResetting(p.id); setMsg(''); setErr('');
    try { await api('people_reset', { recordId: p.id }); setMsg(`Sign-in reset for ${p.email}.`); await load(); }
    catch (e) { setErr(e.message || 'Could not reset.'); }
    finally { setResetting(null); }
  }

  return (
    <section>
      {!noHead && <div class="secthead">People &amp; access <span class="dim">— roles, countries, and sign-ins</span></div>}
      <p class="lead">Everyone who can sign in. Click a person to set their role and which countries they can see — or add someone new.</p>
      {err && <div class="editerr">{err}</div>}
      {msg && <div class="okmsg">{msg}</div>}

      <div class="dc-confirm" style="margin-bottom:12px">
        <button class="savebtn" onClick={() => setEditing({ __new: true })}>➕ Add person</button>
      </div>

      <div class="tablewrap">
        <table class="grants">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Countries</th><th>Password</th><th></th></tr></thead>
          <tbody>
            {people && people.map(p => (
              <tr key={p.id} class="clk" onClick={() => setEditing(p)}>
                <td class="nm">{p.name || '—'}</td>
                <td class="cty">{p.email}</td>
                <td class="cty">{ROLE_LABEL[p.role] || p.role || <span class="rbadge upcoming">No role</span>}</td>
                <td class="cty">{p.allCountries ? 'All' : (p.countries && p.countries.length ? p.countries.length : '—')}</td>
                <td>{p.hasPassword ? <span class="rbadge submitted">Set</span> : <span class="rbadge upcoming">Not yet</span>}</td>
                <td class="r" onClick={e => e.stopPropagation()}>
                  <button class="ghostbtn" onClick={() => setEditing(p)}>Edit</button>{' '}
                  <button class="ghostbtn" disabled={resetting === p.id} onClick={() => reset(p)}>{resetting === p.id ? 'Resetting…' : 'Reset'}</button>
                </td>
              </tr>
            ))}
            {!people && <tr><td colspan="6" class="empty-row">Loading…</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <PersonEditor
          person={editing.__new ? null : editing}
          countries={boot.countries_meta || []}
          onClose={() => setEditing(null)}
          onSaved={m => { setMsg(m); setEditing(null); load(); }}
        />
      )}
    </section>
  );
}

function PersonEditor({ person, countries, onClose, onSaved }) {
  const isNew = !person;
  const [name, setName] = useState(person ? person.name || '' : '');
  const [email, setEmail] = useState(person ? person.email || '' : '');
  const [role, setRole] = useState(person ? person.role || '' : '');
  const [allC, setAllC] = useState(person ? !!person.allCountries : false);
  const [cset, setCset] = useState(() => new Set(person && person.countries ? person.countries : []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggleC = id => setCset(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function save() {
    if (isNew && !email.trim()) { setErr('Email is required.'); return; }
    setBusy(true); setErr('');
    const fields = { name, role, allCountries: allC, countries: allC ? [] : Array.from(cset) };
    try {
      if (isNew) { await api('people_add', { fields: { ...fields, email } }); onSaved(`Added ${name || email}.`); }
      else { await api('people_update', { recordId: person.id, fields }); onSaved(`Saved ${name || email}.`); }
    } catch (e) { setErr(e.message || 'Could not save.'); setBusy(false); }
  }

  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal" onClick={e => e.stopPropagation()}>
        <div class="modal-head">
          <div><h2>{isNew ? 'Add person' : 'Edit person'}</h2>
            <div class="sub2">{isNew ? 'They set their password on first sign-in' : person.email}</div></div>
          <button class="ghostbtn" onClick={onClose}>Close ✕</button>
        </div>

        <div class="editor">
          <label class="fld"><span class="flbl">Name</span>
            <input value={name} onInput={e => setName(e.currentTarget.value)} placeholder="Full name" /></label>
          {isNew && (
            <label class="fld"><span class="flbl">Email</span>
              <input type="email" value={email} onInput={e => setEmail(e.currentTarget.value)} placeholder="name@josiahventure.com" /></label>
          )}
          <label class="fld"><span class="flbl">Role</span>
            <select value={role} onChange={e => setRole(e.currentTarget.value)}>
              <option value="">— No role —</option>
              {Object.values(ROLES).map(r => <option value={r.airtable}>{r.label}</option>)}
            </select>
          </label>

          <label class="check inline"><input type="checkbox" checked={allC} onChange={e => setAllC(e.currentTarget.checked)} /><span>Can see every country</span></label>

          {!allC && (
            <label class="fld"><span class="flbl">Countries they can see</span>
              <div class="country-pick">
                {countries.map(c => (
                  <label class={`check${cset.has(c.id) ? ' on' : ''}`}>
                    <input type="checkbox" checked={cset.has(c.id)} onChange={() => toggleC(c.id)} /><span>{c.name}</span>
                  </label>
                ))}
                {!countries.length && <span class="dim">No countries loaded.</span>}
              </div>
            </label>
          )}
        </div>

        {err && <div class="editerr">{err}</div>}
        <div class="modal-foot actions">
          <button class="ghostbtn" onClick={onClose} disabled={busy}>Cancel</button>
          <button class="savebtn" onClick={save} disabled={busy}>{busy ? 'Saving…' : (isNew ? 'Add person' : 'Save changes')}</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, val, big }) {
  return <div class="cstat"><div class="cstat-l">{label}</div><div class={`cstat-v${big ? ' big' : ''}`}>{val}</div></div>;
}
