// Screenshot the Grant Team pipeline with mocked data (no live backend touched).
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';

const DIST = new URL('../app/dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const F = {
  name: 'fld1qi35letQtg6yC', countryText: 'fldpZ00pUwm1gB4zN', stage: 'fld3Sh8TGO0Nukrgc',
  requested: 'fld3bvuKr1SIXAwUf', awarded: 'fldeeQMQPRVyXbklW', paid: 'fldHug3aktd9okS1W',
  regionalCoach: 'fldstKKgW2SeCjYxG', dateApproved: 'fldY11pVrXtTEKIKR', createdTime: 'fldkSi7mZ7RhhqPvC',
};
let n = 0;
const rec = (name, country, coachName, stage, req, aw, paid) => ({
  id: 'rec_demo_' + (++n), createdTime: '2026-07-0' + ((n % 9) + 1) + 'T09:00:00.000Z',
  fields: {
    [F.name]: name, [F.countryText]: country, [F.regionalCoach]: coachName, [F.stage]: stage,
    [F.requested]: req, ...(aw != null ? { [F.awarded]: aw } : {}), ...(paid != null ? { [F.paid]: paid } : {}),
    [F.dateApproved]: '2026-07-10',
  },
});

const boot = {
  user: { name: 'Mel Ellenwood', email: 'mel@example.org', role: 'Grant team', allCountries: true },
  cycles: [], goals: [], countries_meta: [], reports: [], travel: [], logs: [], funds: [],
  bal: { account: '510181', balance: 41250, asOf: '2026-07-25' },
  props: [
    rec('Helping 35 churches', 'Czech', 'Dan', 'Submitted', 15000),
    rec('POINTonline in Your Pocket', 'Poland', 'Dan', 'Submitted', 15000),
    rec('EDGE Coach Development', 'Slovenia', 'Grace', 'Coach Review', 8000),
    rec('Edge Street Games', 'Serbia', 'Grace', 'Council Lead Team Decision', 5500),
    rec('Camp Volunteer Training', 'Ukraine', 'Petra', 'Approved — Deferred', 5000, 4500),
    rec('Peace with You (Shalom) Tour', 'Hungary', 'Petra', 'Approved — Deferred', 4620, 4000),
    rec('Tempo National Training', 'Estonia', 'Dan', 'At Accounting', 2941, 2650),
    rec('Summer Youth Acceleration', 'Latvia', 'Grace', 'Funded', 1000, 1000, 1000),
  ],
};

const server = createServer((req, res) => {
  if (req.url.startsWith('/.netlify/functions/airtable')) {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(boot)); // every op just gets the bootstrap payload
    });
    return;
  }
  const path = join(DIST, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (existsSync(path)) {
    res.setHeader('Content-Type', MIME[extname(path)] || 'application/octet-stream');
    res.end(readFileSync(path));
  } else { res.setHeader('Content-Type', 'text/html'); res.end(readFileSync(join(DIST, 'index.html'))); }
}).listen(4499);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => localStorage.setItem('jv_token', 'demo'));
await page.goto('http://localhost:4499/');
await page.waitForSelector('.funnel', { timeout: 15000 }).catch(() => {});
// make sure we're on the Grant Team tab
const tab = page.locator('button, a', { hasText: 'Grant Team' }).first();
if (await tab.count()) await tab.click().catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: new URL('./pipeline-preview.png', import.meta.url).pathname, fullPage: false });
await browser.close();
server.close();
console.log('done');
