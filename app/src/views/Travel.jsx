import { useState } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, date } from '../shared/format.js';
import { F, TRAVEL_BADGE } from '../shared/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// SECC travel grants — the shared pieces, used the same way project grants are:
//   apply   → My Country (in-app form) or the public travel.html page
//   decide  → Council Lead Team (TravelCard: approve with amount / deny)
//   pay     → Accounting (TravelPayCard: one click, emails the applicant)
//   money   → Grant Team (fund overview + TravelTable history)
// Status lifecycle and badge colors come from schema.js (TRAVEL_BADGE), so a
// travel request looks the same wherever it appears.
// ─────────────────────────────────────────────────────────────────────────────

export const tripDates = t =>
  (t.depart && t.ret) ? `${date(t.depart)} → ${date(t.ret)}` : (t.depart ? date(t.depart) : '—');

export function TravelBadge({ status }) {
  return <span class={`badge stg-${TRAVEL_BADGE[status] || 'submitted'}`}>{status}</span>;
}

// Council's decision card for one travel application.
export function TravelCard({ t, onDone }) {
  const [mode, setMode] = useState(null); // 'approve' | 'deny' | null
  const [amount, setAmount] = useState(t.reqAmt ? String(t.reqAmt) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function decide(kind) {
    setBusy(true); setErr('');
    const fields = kind === 'approve'
      ? { [F.travel.appAmt]: Number(amount) || 0, [F.travel.status]: 'Approved' }
      : { [F.travel.status]: 'Denied' };
    try {
      await api('travel_update', { recordId: t.id, fields });
      onDone && onDone();
    } catch (e) { setErr(e.message || 'Could not save.'); setBusy(false); }
  }

  return (
    <div class="dcard slim">
      <div class="dc-row" style="cursor:default">
        <div class="dc-rowmain">
          <h3>{t.name || '(no name)'}</h3>
          <div class="dc-meta">{t.team || '—'} · {tripDates(t)} · <b>{money(t.reqAmt)}</b> {t.timing === 'Already taken' ? 'spent — trip already taken' : 'requested'}</div>
        </div>
        {!mode && (
          <div class="dc-actions slim">
            <button class="btn-approve" onClick={() => { setMode('approve'); setErr(''); }}>Approve</button>
            <button class="btn-deny" onClick={() => { setMode('deny'); setErr(''); }}>Deny</button>
          </div>
        )}
      </div>

      <div class="dc-details" style="display:block">
        <div class="dc-ctx"><span class="dt">What the trip is for</span><p>{t.purpose || '—'}</p></div>
        <div class="dc-meta">{t.email}</div>
      </div>

      {mode && (
        <div class="dc-form">
          {mode === 'approve' && (
            <label class="fld"><span class="flbl">Approved amount — from the SECC fund</span>
              <div class="moneyin"><span>$</span><input type="number" step="50" value={amount} onInput={e => setAmount(e.currentTarget.value)} /></div>
              {t.reqAmt > 0 && <button type="button" class="mini" onClick={() => setAmount(String(t.reqAmt))}>Requested = {money(t.reqAmt)}</button>}
            </label>
          )}
          {mode === 'deny' && <p class="lead" style="margin:0">Mark this request as denied? {t.name || 'The applicant'} will get an email letting them know.</p>}
          {err && <div class="editerr">{err}</div>}
          <div class="dc-confirm">
            <button class="ghostbtn" onClick={() => { setMode(null); setErr(''); }} disabled={busy}>Cancel</button>
            <button class={mode === 'deny' ? 'btn-deny solid' : 'savebtn'} disabled={busy} onClick={() => decide(mode)}>
              {busy ? 'Saving…' : mode === 'approve' ? 'Confirm approval' : 'Confirm denial'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Accounting's payout card: both ends of the payment, one click, and the
// applicant is emailed automatically (same "money moment" rule as projects).
export function TravelPayCard({ t, fromFund, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amt = t.appAmt || t.reqAmt || 0;

  async function pay() {
    setBusy(true); setErr('');
    try {
      await api('travel_update', { recordId: t.id, fields: { [F.travel.status]: 'Paid' } });
      onDone && onDone();
    } catch (e) { setErr(e.message || 'Could not record the payment.'); setBusy(false); }
  }

  return (
    <div class="dcard">
      <div class="dc-head">
        <div><h3>{t.name || '(no name)'}</h3><div class="dc-meta">{t.team || '—'} · {tripDates(t)}</div></div>
        <div class="xfer-amt">{money(amt)}</div>
      </div>
      <div class="acctrow">
        <div><div class="cstat-l">From — restricted travel fund</div>
          <div class="acctno">{fromFund || 'SE Christian Foundation'}</div></div>
        <div><div class="cstat-l">To — the applicant</div>
          <div class="acctno">{t.email || '—'}</div></div>
      </div>
      {err && <div class="editerr">{err}</div>}
      <div class="dc-confirm">
        <button class="savebtn" disabled={busy} onClick={pay}>{busy ? 'Recording…' : 'Paid ✓'}</button>
      </div>
    </div>
  );
}

// Read-only list of travel requests — the same table everywhere it appears.
export function TravelTable({ list, empty }) {
  return (
    <div class="tablewrap">
      <table class="grants">
        <thead>
          <tr><th>Who</th><th>Country / team</th><th>Trip</th><th class="r">Requested</th><th class="r">Approved</th><th>Status</th></tr>
        </thead>
        <tbody>
          {list.map(t => (
            <tr key={t.id}>
              <td class="nm" title={t.email}>{t.name || '—'}</td>
              <td class="cty">{t.team || '—'}</td>
              <td class="cty">{tripDates(t)}</td>
              <td class="r">{t.reqAmt ? money(t.reqAmt) : '—'}</td>
              <td class="r">{t.appAmt ? money(t.appAmt) : '—'}</td>
              <td><TravelBadge status={t.status} /></td>
            </tr>
          ))}
          {!list.length && <tr><td colspan="6" class="empty-row">{empty || 'No travel requests.'}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
