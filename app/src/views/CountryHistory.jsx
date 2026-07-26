import { useMemo, useState } from 'preact/hooks';
import { money } from '../shared/format.js';
import { buildCountryHistory } from '../shared/history.js';

// Leadership dashboard (Ben & Amanda + grant team): how much each country has
// received in grants over time. Two ways to see it — grouped BY PHASE (with
// phase and country totals), or BY COUNTRY (every grant a country has ever had,
// with its cycle year and foundation).
export function CountryHistory({ boot }) {
  const { phases, countries, currentYear, priorYear, totals } = useMemo(
    () => buildCountryHistory(boot.props || [], boot.cycles || [], boot.countries_meta || []),
    [boot.props, boot.cycles, boot.countries_meta]
  );
  const [mode, setMode] = useState('phase'); // 'phase' | 'country'

  return (
    <>
      <div class="gt-actions">
        <nav class="subtabs">
          <button class={`subtab${mode === 'phase' ? ' on' : ''}`} onClick={() => setMode('phase')}>By phase</button>
          <button class={`subtab${mode === 'country' ? ' on' : ''}`} onClick={() => setMode('country')}>By country</button>
        </nav>
      </div>

      <div class="secthead">Grants by country <span class="dim">— what each country has received over time</span></div>

      <section class="money">
        <div class="mtile">
          <div class="mlbl">Total granted (all time)</div>
          <div class="mval">{money(totals.all)}</div>
          <div class="mnote">across {totals.countries} {totals.countries === 1 ? 'country' : 'countries'}</div>
        </div>
        <div class="mtile">
          <div class="mlbl">Countries funded</div>
          <div class="mval">{totals.countries}</div>
          <div class="mnote">have received a grant</div>
        </div>
        <div class="mtile hero">
          <div class="mlbl">This cycle{currentYear ? ` · ${currentYear}` : ''}</div>
          <div class="mval">{money(totals.current)}</div>
          <div class="mnote">granted so far</div>
        </div>
      </section>

      {mode === 'phase' ? <ByPhase phases={phases} currentYear={currentYear} priorYear={priorYear} />
                        : <ByCountry countries={countries} />}
    </>
  );
}

function ByPhase({ phases, currentYear, priorYear }) {
  if (!phases.length) return <div class="panel"><p style="color:var(--muted)">No grant history yet.</p></div>;
  return (
    <>
      <p class="lead">Grouped by country phase, with this cycle and last cycle side by side. Countries showing “—” haven't received a grant.</p>
      {phases.map(ph => (
        <div key={ph.phase}>
          <div class="secthead">
            {ph.phase} <span class="dim">— {money(ph.total)} total · {ph.funded} of {ph.countries.length} funded{ph.current ? ` · ${money(ph.current)} this cycle` : ''}</span>
          </div>
          <div class="tablewrap">
            <table class="grants history">
              <thead>
                <tr>
                  <th>Country</th><th class="r">Grants</th><th class="r">Total received</th>
                  <th class="r">{currentYear || 'This cycle'}</th><th class="r">{priorYear || 'Last cycle'}</th>
                </tr>
              </thead>
              <tbody>
                {ph.countries.map(c => (
                  <tr class={c.total ? '' : 'zero'}>
                    <td class="nm">{c.name}</td>
                    <td class="r">{c.count || '—'}</td>
                    <td class="r"><b>{c.total ? money(c.total) : '—'}</b></td>
                    <td class="r">{c.current ? money(c.current) : '—'}</td>
                    <td class="r">{c.prior ? money(c.prior) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

function ByCountry({ countries }) {
  if (!countries.length) return <div class="panel"><p style="color:var(--muted)">No grant history yet.</p></div>;
  return (
    <>
      <p class="lead">Each country with its total. Click one to open it and see every grant it's received, from the beginning.</p>
      <div class="ch-list">
        {countries.map(c => <CountryAccordion key={c.name} c={c} />)}
      </div>
    </>
  );
}

function CountryAccordion({ c }) {
  const [open, setOpen] = useState(false);
  return (
    <div class={`ch-acc${open ? ' open' : ''}`}>
      <button class="ch-acc-head" onClick={() => setOpen(o => !o)}>
        <span class="ch-chev">{open ? '▾' : '▸'}</span>
        <span class="ch-name">{c.name}</span>
        <span class="ch-sub">{c.phase} · {c.count} {c.count === 1 ? 'grant' : 'grants'}</span>
        <span class="ch-total">{money(c.total)}</span>
      </button>
      {open && (
        <div class="ch-acc-body tablewrap">
          <table class="grants history">
            <thead>
              <tr><th>Cycle</th><th>Foundation</th><th>Project</th><th>Status</th><th class="r">Amount</th></tr>
            </thead>
            <tbody>
              {c.grants.map(g => (
                <tr>
                  <td class="cty">{g.year || '—'}</td>
                  <td class="cty">{g.foundation || '—'}</td>
                  <td class="nm">{g.project}</td>
                  <td>{g.funded ? <span class="badge stg-funded">Funded</span> : <span class="dim">{g.stage || '—'}</span>}</td>
                  <td class="r"><b>{money(g.amount)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
