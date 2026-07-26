import { useMemo } from 'preact/hooks';
import { money } from '../shared/format.js';
import { buildCountryHistory } from '../shared/history.js';

// Leadership dashboard (Ben & Amanda + grant team): how much each country has
// received in grants over time, grouped by country phase, with this cycle and
// last cycle broken out so you can see who's been funded recently and who hasn't.
export function CountryHistory({ boot }) {
  const { phases, currentYear, priorYear, totals } = useMemo(
    () => buildCountryHistory(boot.props || [], boot.cycles || [], boot.countries_meta || []),
    [boot.props, boot.cycles, boot.countries_meta]
  );

  return (
    <>
      <div class="secthead">Grants by country <span class="dim">— what each country has received over time</span></div>
      <p class="lead">Total granted to each country, grouped by country phase, with this cycle and last cycle side by side. Countries showing “—” haven't received a grant.</p>

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

      {phases.map(ph => (
        <div key={ph.phase}>
          <div class="secthead">
            {ph.phase} <span class="dim">— {money(ph.total)} total · {ph.funded} of {ph.countries.length} funded{ph.current ? ` · ${money(ph.current)} this cycle` : ''}</span>
          </div>
          <div class="tablewrap">
            <table class="grants history">
              <thead>
                <tr>
                  <th>Country</th>
                  <th class="r">Grants</th>
                  <th class="r">Total received</th>
                  <th class="r">{currentYear || 'This cycle'}</th>
                  <th class="r">{priorYear || 'Last cycle'}</th>
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

      {!phases.length && <div class="panel"><p style="color:var(--muted)">No grant history yet.</p></div>}
    </>
  );
}
