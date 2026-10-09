import { useState, useMemo, useEffect } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, date, aval } from '../shared/format.js';
import { F } from '../shared/schema.js';
import { projectName, country, awarded, requested, stageKey } from '../shared/grants.js';
import { PipelineDash } from './PipelineDash.jsx';
import { TravelPayCard } from './Travel.jsx';

const today = () => new Date().toISOString().slice(0, 10);

// A grant only reaches At Accounting through a council approval, so being here
// IS the sign-off. The stamps shown on each card are a record that the process
// was followed — not a gate Accounting has to wait on. (2026-07-27, per Mel.)
export function Accounting({ boot, onRefresh }) {
  const props = boot.props || [];
  const atAccounting = useMemo(() => props.filter(p => stageKey(p) === 'accounting'), [props]);
  const transferred = useMemo(() => props.filter(p => stageKey(p) === 'transferred'), [props]);

  // Council-approved SECC travel grants wait here for payout, exactly like
  // project grants wait for their transfer. Paying one emails the applicant.
  const travel = boot.travel || [];
  const travelToPay = travel.filter(t => t.status === 'Approved');
  const seccFund = (boot.funds || []).find(r => /SE\s*Christian|SouthEast/i.test(aval((r.fields || {})[F.funds.source]) || ''));
  const seccFundName = seccFund ? aval(seccFund.fields[F.funds.source]) : 'SE Christian Foundation';

  // ── One email for everything ready ───────────────────────────────────────
  // Every ready payment (projects + travel) carries a checkbox, all selected
  // by default; the bar sends accounting a SINGLE email listing the selection.
  const ready = useMemo(() => [
    ...atAccounting.map(p => ({ key: 'project:' + p.id, kind: 'project', id: p.id, amt: awarded(p) || requested(p) })),
    ...travelToPay.map(t => ({ key: 'travel:' + t.id, kind: 'travel', id: t.id, amt: t.appAmt || t.reqAmt || 0 })),
  ], [atAccounting, travelToPay]);
  const [sel, setSel] = useState(() => new Set(ready.map(r => r.key)));
  useEffect(() => { setSel(new Set(ready.map(r => r.key))); setBatchSent(''); }, [ready.map(r => r.key).join('|')]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchSent, setBatchSent] = useState('');
  const [batchErr, setBatchErr] = useState('');
  const toggle = key => setSel(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const picked = ready.filter(r => sel.has(r.key));
  const pickedTotal = picked.reduce((a, r) => a + (r.amt || 0), 0);

  async function emailBatch() {
    setBatchBusy(true); setBatchErr('');
    try {
      const d = await api('pay_request', { items: picked.map(r => ({ kind: r.kind, recordId: r.id })) });
      setBatchSent(`One email sent to ${(d.sentTo || []).join(' & ') || 'accounting'} — ${picked.length} payment${picked.length === 1 ? '' : 's'}, ${money(pickedTotal)}`);
    } catch (e) { setBatchErr(e.message || 'Could not send the email.'); }
    setBatchBusy(false);
  }

  return (
    <>
      <PipelineDash list={props} travel={travel} />

      <div class="secthead">Accounting <span class="dim">— transfers to country accounts</span></div>
      <p class="lead">Every grant here has already been approved by the EVP and the Council Lead Team — that's how it got here. Everything Accounting needs to make the transfer is right here, no email required.</p>

      {ready.length > 1 && (
        <div class="panel" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:16px">
          <div><b>{picked.length}</b> of {ready.length} ready payments selected · <b>{money(pickedTotal)}</b></div>
          <button type="button" class="mini" onClick={() => setSel(picked.length === ready.length ? new Set() : new Set(ready.map(r => r.key)))}>
            {picked.length === ready.length ? 'Unselect all' : 'Select all'}
          </button>
          <div style="margin-left:auto">
            {batchSent
              ? <span class="sent-ok">✓ {batchSent}</span>
              : <button class="savebtn" disabled={!picked.length || batchBusy} onClick={emailBatch}>
                  {batchBusy ? 'Emailing…' : `📧 Email accounting — one email for ${picked.length}`}
                </button>}
          </div>
          {batchErr && <div class="editerr" style="width:100%">{batchErr}</div>}
        </div>
      )}

      <div class="secthead" style="font-size:15px">Ready to transfer <span class="dim">— {atAccounting.length}</span></div>
      {!atAccounting.length && <div class="panel"><p style="color:var(--muted)">Nothing is waiting on a transfer right now.</p></div>}
      <div class="cards">
        {atAccounting.map(p => <TransferCard key={p.id} p={p} fromAcct={(boot.bal && boot.bal.account) || '510181 - National Expansion Projects'} onDone={onRefresh}
          pick={ready.length > 1 ? { checked: sel.has('project:' + p.id), onToggle: () => toggle('project:' + p.id) } : null} />)}
      </div>

      {travelToPay.length > 0 && (
        <>
          <div class="secthead" style="font-size:15px;margin-top:30px">SECC travel — ready to pay <span class="dim">— {travelToPay.length}</span></div>
          <p class="lead">Approved by the Council Lead Team, paid from the {seccFundName} restricted fund. One click records the payment and emails the applicant.</p>
          <div class="cards">
            {travelToPay.map(t => <TravelPayCard key={t.id} t={t} fromFund={seccFundName} onDone={onRefresh}
              pick={ready.length > 1 ? { checked: sel.has('travel:' + t.id), onToggle: () => toggle('travel:' + t.id) } : null} />)}
          </div>
        </>
      )}

      {/* Only appears if a grant was manually parked at Funds Transferred —
          the normal one-click flow goes straight to Project funded. */}
      {transferred.length > 0 && (
        <>
          <div class="secthead" style="font-size:15px;margin-top:30px">Funds transferred <span class="dim">— {transferred.length} to close out</span></div>
          <div class="cards">
            {transferred.map(p => <ConfirmFundedCard key={p.id} p={p} onDone={onRefresh} />)}
          </div>
        </>
      )}
    </>
  );
}

const acctNo = p => aval(p.fields[F.proposal.cedarstoneAccount]) || '';

function TransferCard({ p, fromAcct, onDone, pick }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [asked, setAsked] = useState(''); // who the nudge email went to
  const [asking, setAsking] = useState(false);
  const amt = awarded(p) || requested(p);
  const acct = acctNo(p);
  const approvedOn = p.fields[F.proposal.dateApproved] || '';

  // Amanda's one click: email the people who send money that this is ready.
  async function askToPay() {
    setAsking(true); setErr('');
    try {
      const d = await api('pay_request', { kind: 'project', recordId: p.id });
      setAsked((d.sentTo || []).join(' & ') || 'accounting');
    } catch (e) { setErr(e.message || 'Could not send the email.'); }
    setAsking(false);
  }

  async function transfer() {
    setBusy(true); setErr('');
    const name = projectName(p);
    const fields = {
      // One click for Susan: the transfer is recorded and the grant moves
      // straight through Funds Transferred into Project funded. (A grant only
      // sits AT Funds Transferred if someone parks it there manually.)
      [F.proposal.stage]: 'Funded',
      [F.proposal.dateFunded]: today(),
      [F.proposal.paid]: amt,
      [F.proposal.mTransferOut]: true,
      // Backfill the audit stamps for records approved before 2026-07-27,
      // when the council's approval began setting them directly.
      [F.proposal.evpApproval]: true,
      [F.proposal.mCouncilApproval]: true,
    };
    const changes = [{ type: 'Funding assignment', label: 'Funds transferred',
      detail: `${name} — ${money(amt)} transferred to Cedarstone account ${acct || '(not on file)'}` }];
    try {
      await api('update', { recordId: p.id, fields, changes, projectName: name, notify: { event: 'transfer' } });
      onDone && onDone();
    } catch (e) { setErr(e.message || 'Could not record the transfer.'); setBusy(false); }
  }

  return (
    <div class="dcard">
      <div class="dc-head">
        <div><h3>{projectName(p)}</h3><div class="dc-meta">{country(p)}</div></div>
        <div style="display:flex;align-items:center;gap:14px">
          {pick && (
            <label class={`check inline${pick.checked ? ' on' : ''}`} title="Include in the one email to accounting">
              <input type="checkbox" checked={pick.checked} onChange={pick.onToggle} /><span>Include</span>
            </label>
          )}
          <div class="xfer-amt">{money(amt)}</div>
        </div>
      </div>
      {/* Both ends of the transfer, so Susan never has to look them up. */}
      <div class="acctrow">
        <div><div class="cstat-l">From — National Ministries account</div>
          <div class="acctno">{fromAcct}</div></div>
        <div><div class="cstat-l">To — country's Cedarstone account</div>
          <div class={`acctno${acct ? '' : ' missing'}`}>{acct || 'Not on file — check with the country'}</div></div>
      </div>
      <div class="acctrow">
        <div><div class="cstat-l">Approved{approvedOn ? ` ${date(approvedOn)}` : ''} by</div>
          <div class="cstat-v" style="font-size:13px">EVP ✓ · Council Lead Team ✓</div></div>
      </div>
      {err && <div class="editerr">{err}</div>}
      <div class="dc-confirm">
        {asked
          ? <span class="sent-ok">✓ Emailed {asked}</span>
          : <button class="ghostbtn" disabled={asking || busy} onClick={askToPay} title="Email the accounting team that this transfer is ready to send">
              {asking ? 'Emailing…' : '📧 Email accounting — ready to send'}
            </button>}
        <button class="savebtn" disabled={busy} onClick={transfer} title="Records the transfer and emails the country leader, coach, Ben and Amanda">{busy ? 'Recording…' : 'Funds Transferred ✓'}</button>
      </div>
    </div>
  );
}

// Money has left — this card closes the loop and moves the grant into the
// all-time Project funded total.
function ConfirmFundedCard({ p, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amt = awarded(p) || requested(p);
  const sentOn = p.fields[F.proposal.dateFunded] || '';

  async function confirm() {
    setBusy(true); setErr('');
    const name = projectName(p);
    const fields = { [F.proposal.stage]: 'Funded' };
    if (!p.fields[F.proposal.dateFunded]) fields[F.proposal.dateFunded] = today();
    const changes = [{ type: 'Status change', label: 'Project funded',
      detail: `${name} — confirmed funded (${money(amt)} transferred${sentOn ? ` on ${date(sentOn)}` : ''})` }];
    try {
      await api('update', { recordId: p.id, fields, changes, projectName: name });
      onDone && onDone();
    } catch (e) { setErr(e.message || 'Could not save.'); setBusy(false); }
  }

  return (
    <div class="dcard">
      <div class="dc-head">
        <div><h3>{projectName(p)}</h3><div class="dc-meta">{country(p)}{sentOn ? ` · sent ${date(sentOn)}` : ''}</div></div>
        <div class="xfer-amt">{money(amt)}</div>
      </div>
      {err && <div class="editerr">{err}</div>}
      <div class="dc-confirm">
        <button class="savebtn" disabled={busy} onClick={confirm}>{busy ? 'Saving…' : 'Project funded ✓'}</button>
      </div>
    </div>
  );
}
