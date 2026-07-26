import { useState, useEffect } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, moneyCents, date } from '../shared/format.js';
import { parseBankCSV } from '../shared/csv.js';

export function Management({ boot, onRefresh }) {
  return (
    <>
      <Reconcile boot={boot} onRefresh={onRefresh} />
      <SignIns />
    </>
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

function SignIns() {
  const [people, setPeople] = useState(null);
  const [err, setErr] = useState('');
  const [resetting, setResetting] = useState(null);
  const [msg, setMsg] = useState('');

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
      <div class="secthead">Sign-ins <span class="dim">— reset access for a person</span></div>
      <p class="lead">Everyone who can sign in. Reset a sign-in if someone is locked out — they’ll choose a new password on their next visit.</p>
      {err && <div class="editerr">{err}</div>}
      {msg && <div class="okmsg">{msg}</div>}
      <div class="tablewrap">
        <table class="grants">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Password set</th><th></th></tr></thead>
          <tbody>
            {people && people.map(p => (
              <tr key={p.id}>
                <td class="nm">{p.name || '—'}</td>
                <td class="cty">{p.email}</td>
                <td class="cty">{p.role || '—'}</td>
                <td>{p.hasPassword ? <span class="rbadge submitted">Set</span> : <span class="rbadge upcoming">Not yet</span>}</td>
                <td class="r"><button class="ghostbtn" disabled={resetting === p.id} onClick={() => reset(p)}>{resetting === p.id ? 'Resetting…' : 'Reset'}</button></td>
              </tr>
            ))}
            {!people && <tr><td colspan="5" class="empty-row">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, val, big }) {
  return <div class="cstat"><div class="cstat-l">{label}</div><div class={`cstat-v${big ? ' big' : ''}`}>{val}</div></div>;
}
