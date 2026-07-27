import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, date, aval } from '../shared/format.js';
import { F } from '../shared/schema.js';
import { projectName, country, awarded, requested, stageKey } from '../shared/grants.js';
import { PipelineDash } from './PipelineDash.jsx';

const today = () => new Date().toISOString().slice(0, 10);

// A grant only reaches At Accounting through a council approval, so being here
// IS the sign-off. The stamps shown on each card are a record that the process
// was followed — not a gate Accounting has to wait on. (2026-07-27, per Mel.)
export function Accounting({ boot, onRefresh }) {
  const props = boot.props || [];
  const atAccounting = useMemo(() => props.filter(p => stageKey(p) === 'accounting'), [props]);
  const transferred = useMemo(() => props.filter(p => stageKey(p) === 'transferred'), [props]);

  return (
    <>
      <PipelineDash list={props} />

      <div class="secthead">Accounting <span class="dim">— transfers to country accounts</span></div>
      <p class="lead">Every grant here has already been approved by the EVP and the Council Lead Team — that's how it got here. Everything Accounting needs to make the transfer is right here, no email required.</p>

      <div class="secthead" style="font-size:15px">Ready to transfer <span class="dim">— {atAccounting.length}</span></div>
      {!atAccounting.length && <div class="panel"><p style="color:var(--muted)">Nothing is waiting on a transfer right now.</p></div>}
      <div class="cards">
        {atAccounting.map(p => <TransferCard key={p.id} p={p} fromAcct={(boot.bal && boot.bal.account) || '510181 - National Expansion Projects'} onDone={onRefresh} />)}
      </div>

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

function TransferCard({ p, fromAcct, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amt = awarded(p) || requested(p);
  const acct = acctNo(p);
  const approvedOn = p.fields[F.proposal.dateApproved] || '';

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
        <div class="xfer-amt">{money(amt)}</div>
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
        <button class="savebtn" disabled={busy} onClick={transfer}>{busy ? 'Recording…' : 'Funds Transferred ✓'}</button>
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
