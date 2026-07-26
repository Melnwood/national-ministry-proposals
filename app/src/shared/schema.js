// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the JV National Ministries app.
//
// Every table id, field id, pipeline stage, and role lives here — and ONLY here.
// Both the front-end and the Netlify function import this file, so a schema
// change is a one-line edit in one place instead of a hunt across seven files.
//
// Field ids come straight from the live Airtable base (appLRSKHHakcaW0X9),
// read on 2026-07-26. Airtable ids never change when a field is renamed, so
// these are stable even if someone relabels a column in the UI.
// ─────────────────────────────────────────────────────────────────────────────

export const BASE = 'appLRSKHHakcaW0X9';

// ── Tables ───────────────────────────────────────────────────────────────────
export const TABLES = {
  proposal:   'tblloFNzGSdio6zWS', // Grant Proposal
  cycle:      'tbl8cMmxsPBWP8Iwt', // Grant Cycle
  goals:      'tblmsBWCZxEKjsQdH', // Grant Goals
  countries:  'tblPjsYGcbLPfZzCq', // Countries
  report:     'tblJ1tbsGshSpd1Il', // Project Report
  funds:      'tblKvuCr44xylo7hK', // Available Funds
  log:        'tbl64aSPgrGfRrZov', // Decision Log
  approvers:  'tblKGAf1Y7hSYTIjg', // Approvers (people + roles)
  balance:    'tblWNR84jiDleBali', // Account Balance
  travel:     'tbl89ML7snRz5BQqL', // Travel Fund Requests
};

// ── Fields, grouped by table ─────────────────────────────────────────────────
// Only the fields the app actually reads or writes are listed. Add here as the
// app grows; never inline a raw "fld…" string anywhere else in the codebase.
export const F = {
  proposal: {
    name:            'fld1qi35letQtg6yC', // Project Name
    country:         'fldaHnvEM4RokRDth', // Country (linked)
    countryText:     'fldpZ00pUwm1gB4zN', // Country (text) — plain name for display
    cycles:          'flda02NPGg4TFd8wp', // Grant Cycles (linked)
    status:          'fld1iHtOAuGDPvLVZ', // Status (LEGACY single-select — kept as history)
    stage:           'fld3Sh8TGO0Nukrgc', // Stage (canonical pipeline — source of truth)
    requested:       'fld3bvuKr1SIXAwUf', // How much funding are you requesting?
    totalBudget:     'fldofeeQU3DlrHULR', // Total project budget
    awarded:         'fldeeQMQPRVyXbklW', // Grant Amount Awarded
    paid:            'fldHug3aktd9okS1W', // Amount Paid to Date
    paymentQ:        'fldwMX4PlFq9fP6ky', // Payment Question (the 10% owed flag)
    category:        'fldqZcI9IgfOPCdt3', // Category (S-Team / National / Facilities)
    requestType:     'fldvmIx5iytXPIgve', // Request Type (impact area)
    priority:        'fldPWQOsJHjTCssIC', // Priority Level for Grant
    startDate:       'fldVIJKaXqmUw8qFP',
    endDate:         'fldxV1o8EVEXaitod',
    createdTime:     'fldkSi7mZ7RhhqPvC',
    dateApproved:    'fldY11pVrXtTEKIKR',
    dateFunded:      'fldvXoWNaxcBX8qXq',
    budgetFiles:     'fld3cTDxR62CssdGY', // Budget breakdown (attachments)
    notes:           'fldYl71wMPNhPB2Ce',
    decisionLog:     'fldkAS21IxnJwUwHq', // Decision Log (linked)
    reportLink:      'fldUEWeiL0wyXPTxZ', // Project Report (linked)
    // ── coach (existing records use Regional Coach Name; Assigned Coach is the
    //     new auto-routed link field, empty on legacy records) ──
    regionalCoach:   'fldstKKgW2SeCjYxG', // Regional Coach Name (singleSelect — populated)
    coachEmail:      'fld4lLrDwB5x0ck72', // Coach Email
    // ── coach review (already modeled in the base) ──
    assignedCoach:   'fldfjS1Eu0VUL1B01', // Assigned Coach (linked; auto-routed by country)
    coachReview:     'fldpS6lGiif53cWuo', // Coach Review (assessment criteria, multi-select)
    coachNotes:      'fldC3kE9c6XQ6fLxA', // Coach Notes
    applicantChecklist: 'fldYJSfdlEI8cBTOm', // Check List (applicant's self-assessment)
    // ── pipeline milestone flags (the clean, ordered representation) ──
    mSubmitted:      'fldiAdRWxktreIrDZ', // Project Submitted
    mCoachApproval:  'fldeFzykSsu41oyUu', // Country Coach Approval
    mCouncilApproval:'fldmvzGjvzDOSGlux', // Council Lead Team Approval
    mGrantApproval:  'fldki02HCBpVQdnL6', // Grant Team Approval
    mFundsIdentified:'fldVjJksMFBi3W1zb', // Grant Team Identify Funds
    mCfoApproval:    'flddfW9RJUgq04kQn', // CFO Approval (last gate before money moves)
    mTransferReq:    'fldrsKyo3bDjcPkot', // Transfer Requested to Council Account
    mTransferOut:    'fldp5F3Q4B8xphHGl', // Transfer from Council account to country account
  },
  approvers: {
    email:        'fldE3WddwlJbCRq7U',
    name:         'fldmHfuuitDTDnPXR',
    salt:         'fldzmEAe6cH17xFRw',
    hash:         'fldv0hVikFT0fJlCx',
    role:         'fldX8zlGcfHjCXzUx', // Role (single-select — see ROLES)
    countries:    'fldiXyPUnQ476bAYo', // Countries this person may see (linked)
    allCountries: 'fldA6ibSWz73jves6', // See every country (checkbox)
  },
  log: {
    entry:  'fldY2QaCQeesowSUP',
    type:   'fldWdXntN7qxzP27w',
    detail: 'fldxS6j7X32kek3sA',
    user:   'fldhcgVDw0620rPOq',
    email:  'fldHgUJthRzbKAFBj',
    pid:    'fldB1xE98xE2LdsW2',
    proposal:'fldDCLcDUyODA0AvP', // linked
  },
  balance: { account:'fldkVMZNye4ZFkUtK', balance:'fld8Bv81lUPaMEAxS', asOf:'fld4Wy34J0iJjqGCC', note:'fld29bXKDcudyG0SZ' },
  funds:   { source:'fldVacsCCr02d612m', amount:'fldcZFJwHyfu5IgCl', status:'fldXwNvQuraOWvgq7', note:'fldNn57TqCs35zJnj' },
  countries: { name:'fldzgWM7sqaFDM4Cl', phase:'flduog58oXfNq2aEt', recordId:'fldca6uVjtxsluVK1', approvers:'fldwpCrK2Mr68tQh5' },
};

// ── The canonical pipeline ───────────────────────────────────────────────────
// ONE ordered list of stages = the spine of the whole app. `key` is what the
// code uses; `label` is what people see; `owner` is whose court the ball is in;
// `legacy` maps the messy old Status single-select values onto each stage so we
// can migrate existing records without losing anything.
//
// RECOMMENDED MODEL (pending Mel's confirm): a single clean Stage field becomes
// the source of truth for "where is this grant right now," and the milestone
// checkboxes above stay as "passed this gate on <date>" audit markers.
export const STAGES = [
  { key:'submitted',  label:'Submitted',            owner:'coach',   legacy:['Submitted '] },
  { key:'coach',      label:'Coach Review',         owner:'coach',   legacy:[] },
  { key:'council',    label:'Council Decision',     owner:'evp',     legacy:['EVP Approval'] },
  { key:'deferred',   label:'Approved — Deferred',  owner:'grant',   legacy:['Grant is approved but no funding yet','Pause'] },
  { key:'grantApproved', label:'Grant Team Approved', owner:'grant', legacy:['Grant Team Approval (Dave & Pavel)3'] },
  { key:'fundsFound', label:'Funding Identified',   owner:'grant',   legacy:['Funding For Grant Identified 4'] },
  { key:'cfo',        label:'CFO Review',           owner:'cfo',     legacy:[] },
  { key:'accounting', label:'At Accounting',        owner:'grant',   legacy:['Funds distributed to Council Account 5'] },
  { key:'funded',     label:'Funded',               owner:null,      legacy:['Funds Distributed to Cedarstone Country Account 6'] },
  { key:'denied',     label:'Denied',               owner:null,      legacy:['Grant Team Denial 3.1 '] },
  { key:'archived',   label:'Archived',             owner:null,      legacy:['Achived'] },
];

export const STAGE_BY_KEY = Object.fromEntries(STAGES.map(s => [s.key, s]));
export const STAGE_BY_LABEL = Object.fromEntries(STAGES.map(s => [s.label, s]));
// The active pipeline (excludes terminal outcomes) — used for the funnel view.
export const ACTIVE_STAGE_KEYS = ['submitted','coach','council','deferred','grantApproved','fundsFound','cfo','accounting'];
export const TERMINAL_STAGE_KEYS = ['funded','denied','archived'];
// Reverse lookup: legacy Status text (trimmed) → canonical stage key.
export const LEGACY_STATUS_TO_STAGE = STAGES.reduce((m, s) => {
  s.legacy.forEach(v => { m[v.trim()] = s.key; });
  return m;
}, {});

// ── Roles ────────────────────────────────────────────────────────────────────
// `key` is used in code; `airtable` is the exact option name in the Approvers
// Role field; `scope` is what this role can see. Enforced server-side.
export const ROLES = {
  country: { key:'country', airtable:'Country',                    label:'Country Leader', scope:'own-countries' },
  coach:   { key:'coach',   airtable:'National Ministries Coaches', label:'Regional Coach', scope:'assigned-countries' },
  evp:     { key:'evp',     airtable:'EVP',                        label:'EVP / Council',  scope:'all' },
  president:{ key:'president', airtable:'President',               label:'President',      scope:'all' },
  grant:   { key:'grant',   airtable:'Grant team',                 label:'Grant Team',     scope:'all' },
  cfo:     { key:'cfo',     airtable:'CFO',                        label:'CFO',            scope:'all' },
};
export const ROLE_BY_AIRTABLE = Object.fromEntries(Object.values(ROLES).map(r => [r.airtable, r]));

// ── Shared enums pulled from the base (kept here so nothing string-matches) ────
export const REVIEW_CRITERIA = [
  'Mission Match (does this project fall in line with our vision and mission)',
  'Donor Match (does this fall in line with what is important to the donor)',
  'Forward Motion (does this project help push forward key plans in your strategic plan)',
  'Ability to deliver (It may be a stretch but you could see getting 80% for sure )',
  'Investment Return (will this project have ongoing impact)',
  'Sustainability (do you have a clear plan to keep this project going without grant money in the future)',
];

export const GRANT_CATEGORIES = ['National Country Project', 'S-Team', 'Facilities'];
