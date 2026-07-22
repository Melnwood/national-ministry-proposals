# JV Grant Cycle Dashboard — Deploy Guide

A live dashboard the ministry leader opens in a browser. Each time the page loads, it
pulls fresh figures from the **JV Country Proposals** base. It auto-detects the latest
grant cycle, so it keeps working when you roll into 2026-27 and beyond — no edits needed.

You only do this once. Budget ~15 minutes.

---

## What's in this folder

```
jv-dashboard/
├── index.html                 ← the dashboard (what the leader sees)
├── netlify.toml               ← tells Netlify how to serve it
└── netlify/functions/data.js  ← the private piece that holds your token and reads Airtable
```

Your Airtable token is **never** typed into any of these files. It lives only in
Netlify's settings, on the server. The dashboard talks to `data.js`; `data.js` talks
to Airtable. The browser never sees the token.

---

## Step 1 — Create a read-only Airtable token

1. Go to **https://airtable.com/create/tokens** (Account → Builder hub → Personal access tokens).
2. Click **Create token**. Name it something like `JV Dashboard (read only)`.
3. Under **Scopes**, add: **`data.records:read`** (that's the only one needed).
4. Under **Access**, add the base: **JV Country Proposals**.
5. Click **Create token** and **copy** the value (it starts with `pat...`). You won't see it again — paste it somewhere safe for a minute.

Because the token is read-only, the dashboard can never change or delete anything in your base, no matter what.

---

## Step 2 — Put the site on Netlify

1. Log in at **https://app.netlify.com**.
2. Click **Add new site → Deploy manually**.
3. Drag the **whole `jv-dashboard` folder** onto the drop area. (Drag the folder itself, not the files inside it.)
4. Netlify uploads it and gives you a URL like `https://random-name-123.netlify.app`. The page will load but show an error about a missing token — that's expected; the next step fixes it.

> Optional: **Site configuration → General → Site details → Change site name** to give it a tidy URL like `jv-grants.netlify.app`.

---

## Step 3 — Add your token

1. In your new site, go to **Site configuration → Environment variables**.
2. Click **Add a variable → Add a single variable**.
3. Key: **`AIRTABLE_TOKEN`**  ·  Value: **paste the `pat...` token** from Step 1.
4. Save.
5. Now **redeploy** so the function picks up the token: go to **Deploys**, then either click **Trigger deploy → Deploy site**, or simply drag the `jv-dashboard` folder onto the Deploys page again.

Reload the site — the dashboard should now show live data.

---

## Step 4 — Put a password on it (recommended for money data)

You're on a paid plan, so the built-in gate is the easy route:

1. **Site configuration → General → Visitor access → Password protection.**
2. Choose **Basic protection**, set a password, scope it to **All deploys**, and save.

Now anyone opening the link sees a clean password page first. Share the **URL + the one
password** with the ministry leader — that's all he needs. No Airtable, no account, no app.

*(If you're on Enterprise, "Team login protection" lets each person log in individually
so you can revoke access per person — optional, not required.)*

---

## Living with it

- **New cycle?** Nothing to do. When 2026-27 cycle records are added to the base, the
  dashboard automatically switches to showing them (it always shows the latest cycle year).
- **Numbers look off?** They mirror the base exactly. The dashboard surfaces a couple of
  reconciliation notes (e.g. the per-project awarded total vs. the cycle's award rollup,
  and any projects missing a Country tag) so discrepancies are visible rather than hidden.
- **Want design tweaks** (colors, logo, extra panels)? Edit `index.html` and re-drag the
  folder to redeploy. Easier long term: connect the folder to a GitHub repo so updates
  deploy automatically — ask and I'll walk you through it.
- **Rotate the token** anytime in Airtable; just update the `AIRTABLE_TOKEN` value in
  Netlify and redeploy.

---

## If something breaks

The dashboard shows the actual error on-screen. Most common:

- *"Missing AIRTABLE_TOKEN"* → the env var isn't set, or you didn't redeploy after adding
  it. Redo Step 3.
- *"Airtable … responded 401/403"* → the token is wrong, expired, or wasn't given access
  to the JV Country Proposals base. Recreate it (Step 1) and update the env var.
- *Page asks for a password you didn't set* → that's Step 4's protection working.
