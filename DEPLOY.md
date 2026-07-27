# National Ministry Proposals — deploy notes

Live site: https://national-ministry-proposals.netlify.app

(This repo deploys to the `national-ministry-proposals` Netlify project. An older
site, `national-ministry-projects-grant-dep.netlify.app`, is stale and now 404s —
ignore it.)

## How deploys work

This repo is connected to Netlify. **Pushing to `main` deploys the site automatically.**
Netlify builds the v2 app (`app/src`, Vite) on every deploy and publishes the built
output — changes to `app/src` are NOT live until a push triggers this build.

Settings (already declared in `netlify.toml`):

- build command: `cd app && npm ci && npm run build` + copy legacy pages/favicons into `dist`
- publish directory: `app/dist` (v2 app at `/`, old console kept at `/console.html`)
- functions directory: `netlify/functions`

## Environment variables

These live in Netlify (Project configuration → Environment variables), **not in this repo**.
Never put them in code.

- `AIRTABLE_TOKEN` — Airtable personal access token, read + write
- `SESSION_SECRET` — used to sign login sessions

## Pages

| File | Purpose | URL |
|---|---|---|
| `index.html` | Grant department console — approvals, funds | `/` |
| `director.html` | Director dashboard — priorities, travel fund, budgets | `/director.html` |
| `reports.html` | Mid/final report tracking | `/reports.html` |
| `phases.html` | Grants grouped by phase | `/phases.html` |
| `travel.html` | Open travel-fund request form for country leaders | `/travel.html` |
| `netlify/functions/airtable.js` | All Airtable reads/writes + budget file proxy | `/.netlify/functions/airtable` |

## Build markers

Every page shows a visible build marker so you can confirm a deploy landed:

- console: footer reads `Country Proposals · BUILD n`
- dashboard: header reads `report build n`
- reports: `reports page build n`
- phases: `phases build n`
- travel form: HTML comment `travel build n`
- function: comment at the top of `airtable.js`

After deploying, open the site in a private/incognito window and check the marker.

## Airtable

Base: `appLRSKHHakcaW0X9` (JV Country Proposals)

Base and table IDs appear in the code. They are not credentials — they are useless
without `AIRTABLE_TOKEN`.
