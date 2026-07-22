# National Ministry Proposals — deploy notes

Live site: https://national-ministry-projects-grant-dep.netlify.app

## How deploys work

This repo is connected to Netlify. **Pushing to `main` deploys the site automatically.**
There is no build step — the pages are plain HTML and the function uses Node's built-in
fetch, so nothing needs to be compiled or installed.

Settings (already declared in `netlify.toml`):

- publish directory: `.`
- functions directory: `netlify/functions`
- build command: *(none)*

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
