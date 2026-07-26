import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, aval } from '../shared/format.js';
import { F } from '../shared/schema.js';
import { projectName, country, awarded, requested, stageKey } from '../shared/grants.js';

const today = () => new Date().toISOString().slice(0, 10);

export function Accounting({ boot, session, onRefresh }) {
  const props = boot.props || [];
  const role = (session.role && session.role.key) || '';
  const isCFO = role === 'cfo' || role === 'evp' || role === 'president';

  const ready = useMemo(() => props.filter(p => stageKey(p) === 'accounting'), [props]);
  const awaitingCFO = useMemo(() => props.filter(p => stageKey(p) === 'cfo'), [props]);

  return (
    <>
      <div class="secthead">Accounting <span class="dim">— transfers to country accounts</span></div>
      <p class="lead">Grants that are approved, funded, and cleared by the CFO — ready to send to the country's Cedarstone account. Everything you need to make the transfer is here, so nothing runs through email.</p>

      <div class="secthead" style="font-size:15px">Ready to transfer <span class="dim">— {ready.length}</span></div>
      {!ready.length && <div class="panel"><p style="color:var(--muted)">Nothing is waiting for a transfer right now.</p></div>}
      <div class="cards">
        {ready.map(p => <TransferCard key={p.id} p={p} onDone={onRefresh} />)}
      </div>

      {awaitingCFO.length > 0 && (
        <>
          <div class="secthead" style="font-size:15px;margin-top:30px">Awaiting CFO sign-off <span class="dim">— {awaitingCFO.length}</span></div>
          <div class="cards">
            {awaitingCFO.map(p => <CFOCard key={p.id} p={p} canStamp={isCFO} onDone={onRefresh} />)}
          </div>
        </>
      )}
    </>
  );
}

function acctNo(p) { return aval(p.fields[F.proposal.cedarstoneAccount]) || ''; }

function TransferCard({ p, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amt = awarded(p) || requested(p);
  const acct = acctNo(p);

  async function transfer() {
    setBusy(true); setErr('');
    const name = projectName(p);
    const fields = {
      [F.proposal.stage]: 'Funded',
      [F.proposal.dateFunded]: today(),
      [F.proposal.paid]: amt,
      [F.proposal.mTransferOut]: true,
    };
    const changes = [{ type: 'Funding assignment', label: 'Funds transferred',
      detail: `${name} — ${money(amt)} transferred to Cedarstone account ${acct || '(not on file)'}` }];
    try {
      await api('update', { recordId: p.id, fields, changes, projectName: name });
      onDone && onDone();
    } catch (e) { setErr(e.message || 'Could not record the transfer.'); setBusy(false); }
  }

  return (
    <div class="dcard">
      <div class="dc-head">
        <div>
          <h3>{projectName(p)}</h3>
          <div class="dc-meta">{country(p)}</div>
        </div>
        <div class="xfer-amt">{money(amt)}</div>
      </div>
      <div class="acctrow">
        <div><div class="cstat-l">Cedarstone account</div>
          <div class={`acctno${acct ? '' : ' missing'}`}>{acct || 'Not on file — check with the country'}</div></div>
        <div><div class="cstat-l">CFO cleared</div><div class="cstat-v">{p.fields[F.proposal.mCfoApproval] ? '✓ Yes' : '—'}</div></div>
      </div>
      {err && <div class="editerr">{err}</div>}
      <div class="dc-confirm">
        <button class="savebtn" disabled={busy} onClick={transfer}>{busy ? 'Recording…' : `Mark ${money(amt)} transferred`}</button>
      </div>
    </div>
  );
}

function CFOCard({ p, canStamp, onDone }) {
  const [busy, setBusy] = useState(false);
  const amt = awarded(p) || requested(p);

  async function stamp() {
    setBusy(true);
    const name = projectName(p);
    try {
      await api('update', {
        recordId: p.id,
        fields: { [F.proposal.stage]: 'At Accounting', [F.proposal.mCfoApproval]: true },
        changes: [{ type: 'Status change', label: 'CFO cleared to pay', detail: `${name} cleared by CFO for transfer (${money(amt)})` }],
        projectName: name,
      });
      onDone && onDone();
    } catch (e) { setBusy(false); }
  }

  return (
    <div class="dcard muted-card">
      <div class="dc-head">
        <div><h3>{projectName(p)}</h3><div class="dc-meta">{country(p)} · {money(amt)}</div></div>
        {canStamp
          ? <button class="btn-approve" disabled={busy} onClick={stamp}>{busy ? '…' : 'Stamp: cleared to pay'}</button>
          : <span class="badge stg-cfo">Awaiting CFO</span>}
      </div>
    </div>
  );
}
