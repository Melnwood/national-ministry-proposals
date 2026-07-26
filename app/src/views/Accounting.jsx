import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, aval } from '../shared/format.js';
import { F } from '../shared/schema.js';
import { projectName, country, awarded, requested, stageKey } from '../shared/grants.js';

const today = () => new Date().toISOString().slice(0, 10);
const isChecked = (p, key) => p.fields[F.proposal[key]] === true;

export function Accounting({ boot, session, onRefresh }) {
  const props = boot.props || [];
  const role = (session.role && session.role.key) || '';
  const canStamp = role === 'evp' || role === 'president';

  const atAccounting = useMemo(() => props.filter(p => stageKey(p) === 'accounting'), [props]);
  const cleared = atAccounting.filter(p => isChecked(p, 'evpApproval') && isChecked(p, 'mCouncilApproval'));
  const awaiting = atAccounting.filter(p => !(isChecked(p, 'evpApproval') && isChecked(p, 'mCouncilApproval')));

  return (
    <>
      <div class="secthead">Accounting <span class="dim">— transfers to country accounts</span></div>
      <p class="lead">A grant is cleared to send once the EVP and the Council Lead Team have both stamped it. Then everything Accounting needs to make the transfer is right here — no email required.</p>

      <div class="secthead" style="font-size:15px">Ready to transfer <span class="dim">— {cleared.length}</span></div>
      {!cleared.length && <div class="panel"><p style="color:var(--muted)">Nothing is cleared for transfer yet.</p></div>}
      <div class="cards">
        {cleared.map(p => <TransferCard key={p.id} p={p} onDone={onRefresh} />)}
      </div>

      {awaiting.length > 0 && (
        <>
          <div class="secthead" style="font-size:15px;margin-top:30px">Awaiting sign-off <span class="dim">— {awaiting.length}</span></div>
          <p class="lead">Needs both stamps before Accounting can send it.</p>
          <div class="cards">
            {awaiting.map(p => <SignoffCard key={p.id} p={p} canStamp={canStamp} onDone={onRefresh} />)}
          </div>
        </>
      )}
    </>
  );
}

const acctNo = p => aval(p.fields[F.proposal.cedarstoneAccount]) || '';

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
      <div class="acctrow">
        <div><div class="cstat-l">Cedarstone account</div>
          <div class={`acctno${acct ? '' : ' missing'}`}>{acct || 'Not on file — check with the country'}</div></div>
        <div><div class="cstat-l">Cleared by</div><div class="cstat-v" style="font-size:13px">EVP ✓ · Council Lead Team ✓</div></div>
      </div>
      {err && <div class="editerr">{err}</div>}
      <div class="dc-confirm">
        <button class="savebtn" disabled={busy} onClick={transfer}>{busy ? 'Recording…' : `Mark ${money(amt)} transferred`}</button>
      </div>
    </div>
  );
}

function SignoffCard({ p, canStamp, onDone }) {
  const [busy, setBusy] = useState('');
  const amt = awarded(p) || requested(p);
  const evp = isChecked(p, 'evpApproval');
  const council = isChecked(p, 'mCouncilApproval');

  async function stamp(which) {
    setBusy(which);
    const name = projectName(p);
    const fieldKey = which === 'evp' ? 'evpApproval' : 'mCouncilApproval';
    const label = which === 'evp' ? 'EVP stamped' : 'Council Lead Team stamped';
    // If the other stamp is already set, this one clears it for transfer.
    const completesBoth = which === 'evp' ? council : evp;
    try {
      await api('update', {
        recordId: p.id,
        fields: { [F.proposal[fieldKey]]: true },
        changes: [{ type: 'Status change', label, detail: `${name} — ${label} (cleared toward transfer)` }],
        projectName: name,
        ...(completesBoth ? { notify: { event: 'cleared' } } : {}),
      });
      onDone && onDone();
    } catch (e) { setBusy(''); }
  }

  return (
    <div class="dcard">
      <div class="dc-head">
        <div><h3>{projectName(p)}</h3><div class="dc-meta">{country(p)} · {money(amt)}</div></div>
      </div>
      <div class="stamps">
        <Stamp label="EVP" done={evp} which="evp" canStamp={canStamp} busy={busy} onStamp={stamp} />
        <Stamp label="Council Lead Team" done={council} which="council" canStamp={canStamp} busy={busy} onStamp={stamp} />
      </div>
    </div>
  );
}

function Stamp({ label, done, which, canStamp, busy, onStamp }) {
  if (done) return <div class="stamp done">✓ {label} stamped</div>;
  if (canStamp) return <button class="stamp-btn" disabled={busy === which} onClick={() => onStamp(which)}>{busy === which ? '…' : `Stamp as ${label}`}</button>;
  return <div class="stamp pending">Awaiting {label}</div>;
}
