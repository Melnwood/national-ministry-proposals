import { useState, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { money, date, aval, daysAgo } from '../shared/format.js';
import { F } from '../shared/schema.js';
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

  return (
    <>
      <div class="secthead">Your grants <span class="dim">— {grants.length}</span></div>
      <p class="lead">Every project you've submitted and where it stands. Deferred projects need a monthly check-in to stay on the list.</p>

      {!grants.length && <div class="panel"><p style="color:var(--muted)">No grants on file for your country yet.</p></div>}
      <div class="cards">
        {grants.map(p => <GrantStatus key={p.id} p={p} reports={reportsByProp[p.id] || []} onDone={onRefresh} />)}
      </div>
    </>
  );
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
