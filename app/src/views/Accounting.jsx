import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, date, aval } from '../shared/format.js';
import { F, STAGE_BY_KEY } from '../shared/schema.js';
import { projectName, country, coach, awarded, requested, paid, stageKey, stageLabel } from '../shared/grants.js';
import { PipelineDash, TILE_LABEL } from './PipelineDash.jsx';

const today = () => new Date().toISOString().slice(0, 10);

// A grant only reaches At Accounting through a council approval, so being here
// IS the sign-off. The stamps shown on each card are a record that the process
// was followed — not a gate Accounting has to wait on. (2026-07-27, per Mel.)
export function Accounting({ boot, onRefresh }) {
  const props = boot.props || [];
  const atAccounting = useMemo(() => props.filter(p => stageKey(p) === 'accounting'), [props]);
  const transferred = useMemo(() => props.filter(p => stageKey(p) === 'transferred'), [props]);

  // Susan can click any pipeline window (and the Deferred/Denied chips) to
  // see what's in it — view only, nothing editable from here.
  const [pick, setPick] = useState(null);
  const [viewP, setViewP] = useState(null);
  const picked = useMemo(() => (pick ? props.filter(p => stageKey(p) === pick) : []), [props, pick]);

  return (
    <>
      <PipelineDash list={props} onSelect={k => { setPick(k); setViewP(null); }} selected={pick} />

      {pick && (
        <>
          <div class="secthead" style="font-size:15px">{TILE_LABEL[pick] || STAGE_BY_KEY[pick].label} <span class="dim">— {picked.length}, view only</span></div>
          <div class="tablewrap">
            <table class="grants">
              <thead><tr><th>Grant</th><th>Country</th><th>Coach</th><th class="r">Requested</th><th class="r">Awarded</th></tr></thead>
              <tbody>
                {picked.map(p => (
                  <tr class="clk" key={p.id} onClick={() => setViewP(p)}>
                    <td class="nm">{projectName(p)}</td>
                    <td class="cty">{country(p)}</td>
                    <td class="cty">{coach(p) || '—'}</td>
                    <td class="r">{requested(p) ? money(requested(p)) : '—'}</td>
                    <td class="r">{awarded(p) ? money(awarded(p)) : '—'}</td>
                  </tr>
                ))}
                {!picked.length && <tr><td colspan="5" class="empty-row">Nothing in this stage right now.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {viewP && <ViewGrant p={viewP} onClose={() => setViewP(null)} />}

      <div class="secthead">Accounting <span class="dim">— transfers to country accounts</span></div>
      <p class="lead">Every grant here has already been approved by the EVP and the Council Lead Team — that's how it got here. Everything Accounting needs to make the transfer is right here, no email required.</p>

      <div class="secthead" style="font-size:15px">Ready to transfer <span class="dim">— {atAccounting.length}</span></div>
      {!atAccounting.length && <div class="panel"><p style="color:var(--muted)">Nothing is waiting on a transfer right now.</p></div>}
      <div class="cards">
        {atAccounting.map(p => <TransferCard key={p.id} p={p} onDone={onRefresh} />)}
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

// Read-only look at a grant from Susan's side — everything useful, nothing
// editable. Changes happen on the Grant Team page.
function ViewGrant({ p, onClose }) {
  const f = p.fields || {};
  const val = key => aval(f[F.proposal[key]]);
  return (
    <div class="modal-scrim" onClick={onClose}>
      <div class="modal" onClick={e => e.stopPropagation()}>
        <div class="modal-head">
          <div>
            <span class={`badge stg-${stageKey(p)}`}>{stageLabel(p)}</span>
            <h2>{projectName(p)}</h2>
            <div class="sub2">{country(p)}{coach(p) ? ` · Coach: ${coach(p)}` : ''} · view only</div>
          </div>
          <button class="ghostbtn" onClick={onClose}>Close ✕</button>
        </div>
        <div class="dl">
          <div class="dlrow"><span class="dt">Requested</span><span class="dd">{requested(p) ? money(requested(p)) : '—'}</span></div>
          <div class="dlrow"><span class="dt">Awarded</span><span class="dd">{awarded(p) ? money(awarded(p)) : '—'}</span></div>
          <div class="dlrow"><span class="dt">Paid to date</span><span class="dd">{paid(p) ? money(paid(p)) : '—'}</span></div>
          <div class="dlrow"><span class="dt">Cedarstone account</span><span class="dd">{acctNo(p) || '—'}</span></div>
          <div class="dlrow"><span class="dt">Category</span><span class="dd">{val('category') || '—'}</span></div>
          <div class="dlrow"><span class="dt">Approved</span><span class="dd">{val('dateApproved') ? date(val('dateApproved')) : '—'}</span></div>
          <div class="dlrow"><span class="dt">Date funded</span><span class="dd">{val('dateFunded') ? date(val('dateFunded')) : '—'}</span></div>
        </div>
        {val('coachNotes') && <div class="notes"><div class="dt">Coach notes</div><p>{val('coachNotes')}</p></div>}
        {val('decisionMessage') && (
          <div class="notes">
            <div class="dt">{stageKey(p) === 'denied' ? 'Why it was denied' : 'Council Lead Team note'}</div>
            <p>{val('decisionMessage')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TransferCard({ p, onDone }) {
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
      <div class="acctrow">
        <div><div class="cstat-l">Cedarstone account</div>
          <div class={`acctno${acct ? '' : ' missing'}`}>{acct || 'Not on file — check with the country'}</div></div>
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
