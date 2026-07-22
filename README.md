# JV Grant Approval Console — Netlify deployment

A multi-user, two-way grant approval tool for the **JV Country Proposals** base.
Approvers sign in with their own email + password, review proposals, record the
EVP approval, assign funding, and move grant-team status — and every action plus
every login is written to a **Decision Log** table in Airtable (who, what, when).

The Airtable token lives **only** on Netlify's servers as an environment
variable — it is never sent to anyone's browser. Sign-in is handled by the app
itself (no Netlify Identity): passwords are stored hashed, and the server issues
a signed session token.

---

## What's in this folder
```
index.html                     the console (front end)
netlify.toml                   Netlify config
netlify/functions/airtable.js  server-side proxy + auth + audit logging
README.md                      this file
```

## One-time setup (about 10 minutes)

### 1. Create an Airtable Personal Access Token
At airtable.com/create/tokens, create a token with scopes **data.records:read**
and **data.records:write**, with access to the **JV Country Proposals** base.
Copy it (starts with `pat...`).

### 2. Deploy to Netlify
Drag this folder onto the Netlify "Sites" page (Add new site → Deploy manually),
or import it from Git.

### 3. Add two environment variables
Site configuration → Environment variables → Add:
- `AIRTABLE_TOKEN` = the `pat...` token from step 1
- `SESSION_SECRET` = any long random string (e.g. mash the keyboard, 40+ chars).
  This signs the login sessions — keep it private; changing it logs everyone out.
Then **redeploy** (Deploys → Trigger deploy) so the function picks them up.

### 4. Add your approvers (this is your "who can log in" list)
In Airtable, open the **Approvers** table and add one row per person:
- **Email** — the email they'll log in with
- **Name** — shown on their decisions in the Decision Log
- **Role** — optional note (e.g. EVP, Grant Team)
- Leave **Salt** and **Hash** blank — the app fills those in.

The first time a person signs in, they enter their email and choose a password;
it's hashed and saved automatically. After that it's verified on each login.

**To reset someone's password:** clear their **Salt** and **Hash** cells; they'll
set a new password on their next sign-in.
**To remove access:** delete their row (or clear Salt/Hash to lock them out).

That's it. Open the site URL, sign in, and you're in.

---

## How the audit trail works
Every approval, status change, funding assignment, award amount, and login
creates a row in the **Decision Log** table, stamped with the signed-in user's
name + email and the time. See a project's trail in its detail panel, or open the
Decision Log table directly in Airtable.

## The EVP-approval email automation (build in Airtable)
- **Trigger:** record matches conditions on Grant Proposal — *Status is
  "EVP Approval"* (the option still stored as "CLT Application Approved 2")
  **and** *Grant team notified is unchecked*.
- **Actions:** (1) Send email to the grant team with the project name, country,
  requested amount, and a link `https://YOUR-SITE.netlify.app/?id=` + the record
  ID (the console deep-links to that project); (2) update the record to **check
  "Grant team notified"** so it can't fire twice.

## Notes
- Targets base/tables/fields by ID, so renaming fields won't break it.
- Runs on Netlify's default Node runtime (built-in `fetch` + `crypto`).
- Sessions last 12 hours, then a fresh sign-in is required.
