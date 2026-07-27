// JV Grant Approval Console — server-side proxy + self-contained auth.
// No Netlify Identity. Approvers live in the Approvers table; passwords are
// stored hashed (PBKDF2). On login the server returns an HMAC-signed session
// token; every other request must carry it. Every decision + login is written
// to the Decision Log, attributed to the signed-in user.

const crypto = require('crypto');

const BASE   = 'appLRSKHHakcaW0X9';
const T_PROP = 'tblloFNzGSdio6zWS';   // Grant Proposal
const T_CYCLE= 'tbl8cMmxsPBWP8Iwt';   // Grant Cycle
const T_LOG  = 'tbl64aSPgrGfRrZov';   // Decision Log
const T_APP  = 'tblKGAf1Y7hSYTIjg';   // Approvers
const T_FUNDS= 'tblKvuCr44xylo7hK';   // Available Funds
const T_BAL  = 'tblWNR84jiDleBali';   // Account Balance
const T_GOALS= 'tblmsBWCZxEKjsQdH';   // Grant Goals
// JV Grant Console serverless function — build 50 (sign-in reset for approvers)
const T_COUNTRIES= 'tblPjsYGcbLPfZzCq'; // Countries (for phase grouping)
const T_REPORT= 'tblJ1tbsGshSpd1Il';   // Project Report (mid/final report tracking)
const T_TRAVEL= 'tbl89ML7snRz5BQqL';   // Travel Fund Requests (SE Christian)
// Travel Fund Requests field ids
const TR = { name:'fldbCntiM2HMr1RB8', email:'fldkvXwabXsOhU4jX', team:'fldWcmKEDpGAD9o1A',
             purpose:'fld8oHEtAeBQbsYWR', depart:'fldc3LDVsLMCU16Vd', ret:'fldMvpfZTKuBwAhmB',
             reqAmt:'fldRwm5T4wcLIeIuL', appAmt:'fldGoVMNTpc2jf0v5', status:'fldtcWGoQLVOQcG5P', notes:'fldbcUSKRon6HgyDC',
             timing:'fldU7Chmdixe07jZs', actual:'flduryDoK9wzjxh3C' };
const FUND_AMT_F = 'fldcZFJwHyfu5IgCl', FUND_STAT_F = 'fldXwNvQuraOWvgq7'; // Available Funds amount + status
const T_NOTIF = 'tblEpClYAomtd5t2l';  // Notifications
const N = { msg:'fldrTRN1vLi2HC3Db', email:'fld6amQya62dBl92t', type:'fldYI8zxRVWHXuue0', read:'fldPKZTrB6gLZEIQ2', prop:'fldtwJsPOfbte87pS', link:'fldkcJpvziAQoRSWz' };
const SITE_URL = 'https://national-ministry-proposals.netlify.app'; // recipients sign in and land on their own page
const AT     = 'https://api.airtable.com/v0/';
const TOKEN  = process.env.AIRTABLE_TOKEN;
const SECRET = process.env.SESSION_SECRET;

const PROP_CREATED = 'fldkSi7mZ7RhhqPvC';
const L = { type:'fldWdXntN7qxzP27w', detail:'fldxS6j7X32kek3sA', user:'fldhcgVDw0620rPOq',
            email:'fldHgUJthRzbKAFBj', pid:'fldB1xE98xE2LdsW2', entry:'fldY2QaCQeesowSUP' };
const A = { email:'fldE3WddwlJbCRq7U', name:'fldmHfuuitDTDnPXR', salt:'fldzmEAe6cH17xFRw', hash:'fldv0hVikFT0fJlCx',
            role:'fldX8zlGcfHjCXzUx', countries:'fldiXyPUnQ476bAYo', allCountries:'fldA6ibSWz73jves6' };

// Attach role + country scope to a signed-in user, read from their Approvers
// record. Additive and backward-compatible: existing pages ignore these fields;
// the v2 app uses them to route to the right role view and (later) to enforce
// what each person may see. Falls back to an empty scope if anything fails.
function attachScope(user, rec){
  try{
    user.role = rec.fields[A.role] || '';
    user.allCountries = !!rec.fields[A.allCountries];
    user.countryIds = Array.isArray(rec.fields[A.countries]) ? rec.fields[A.countries] : [];
  }catch(e){ user.role = user.role || ''; }
  return user;
}
// Who may reset another person's sign-in. Add an email here to grant that power.
const ADMINS = ['mellenwood@josiahventure.com'];

function reply(code, obj){ return { statusCode:code, headers:{'Content-Type':'application/json'}, body:JSON.stringify(obj) }; }
const v = x => Array.isArray(x) ? x.map(v).join(', ') : (x && typeof x==='object' && 'name' in x ? x.name : x);

// ---- crypto helpers ----
function b64u(buf){ return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function sign(payload){ return b64u(crypto.createHmac('sha256', SECRET).update(payload).digest()); }
function makeToken(user){
  const payload = b64u(JSON.stringify({ email:user.email, name:user.name,
    role:user.role||'', allCountries:!!user.allCountries, countryIds:user.countryIds||[],
    exp:Date.now()+1000*60*60*12 })); // 12h
  return payload + '.' + sign(payload);
}
function verifyToken(token){
  if(!token || token.indexOf('.') < 0) return null;
  const [payload, sig] = token.split('.');
  const expect = sign(payload);
  if(sig.length !== expect.length) return null;
  if(!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  let data; try{ data = JSON.parse(Buffer.from(payload.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; }
  if(!data.exp || Date.now() > data.exp) return null;
  return { email:data.email, name:data.name, role:data.role||'', allCountries:!!data.allCountries, countryIds:data.countryIds||[] };
}

// ---- role scope ----
// Oversight roles see everything and may act broadly; coach/country are scoped
// to their assigned Countries. Enforced server-side (defense in depth on top of
// the front-end tabs).
const OVERSIGHT_ROLES = ['EVP','President','Grant team','CFO'];
const isOversight = who => OVERSIGHT_ROLES.includes((who && who.role || '').trim());
// Only country leaders are hard-scoped to their own countries. Coaches are
// staff (they see the queue) until per-coach country assignment is populated.
const isScopedCountry = who => (who && who.role || '').trim() === 'Country' && !(who && who.allCountries);
const canDelete   = who => ['EVP','President','Grant team'].includes((who && who.role||'').trim()) || ADMINS.includes((who&&who.email||'').trim().toLowerCase());
const canBalance  = who => ['EVP','President'].includes((who && who.role||'').trim()) || ADMINS.includes((who&&who.email||'').trim().toLowerCase());
const PROP_COUNTRY_LINK = 'fldaHnvEM4RokRDth';
function inScope(who, propFields){
  if(isOversight(who) || (who && who.allCountries)) return true;
  const allowed = new Set(who && who.countryIds || []);
  if(!allowed.size) return false;
  const link = propFields && propFields[PROP_COUNTRY_LINK];
  return Array.isArray(link) && link.some(id => allowed.has(id));
}
// Keep the legacy Status single-select in sync when the app writes the canonical
// Stage, so existing Airtable automations (report creation, notifications) that
// still watch Status keep firing. Exact legacy strings (typos/spaces included).
const STAGE_F = 'fld3Sh8TGO0Nukrgc', STATUS_F = 'fld1iHtOAuGDPvLVZ';
const STAGE_TO_STATUS = {
  'Submitted':'Submitted ',
  'Council Lead Team Approval':'EVP Approval',
  'Council Lead Team Decision':'EVP Approval', // pre-rename label, kept for stale clients
  'Council Decision':'EVP Approval', // pre-2026-07-27 label, kept for stale clients
  'Deferred':'Grant is approved but no funding yet',
  'Approved — Deferred':'Grant is approved but no funding yet', // pre-rename label
  // 'Grant Team Approved' / 'Funding Identified' stages retired 2026-07-27;
  // mappings kept so a stale client writing them still syncs legacy Status.
  'Grant Team Approved':'Grant Team Approval (Dave & Pavel)3',
  'Funding Identified':'Funding For Grant Identified 4',
  'At Accounting':'Funds distributed to Council Account 5',
  'Funds Transferred':'Funds Distributed to Cedarstone Country Account 6',
  'Funded':'Funds Distributed to Cedarstone Country Account 6',
  'Denied':'Grant Team Denial 3.1 ', 'Archived':'Achived'
};
function hashPw(password, salt){ return crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex'); }
function eqStr(a, b){ const x=Buffer.from(a||''), y=Buffer.from(b||''); return x.length===y.length && crypto.timingSafeEqual(x, y); }

// ---- airtable helpers ----
async function at(path, opts={}){
  const r = await fetch(AT + path, { ...opts, headers:{ Authorization:'Bearer '+TOKEN, 'Content-Type':'application/json', ...(opts.headers||{}) } });
  const t = await r.text(); let d; try{ d = JSON.parse(t); }catch(e){ d = { raw:t }; }
  if(!r.ok) throw new Error((d.error && (d.error.message||d.error.type)) || ('Airtable HTTP '+r.status));
  return d;
}
async function fetchAll(table, params){
  let recs=[], offset;
  do{
    const q = new URLSearchParams(params); q.set('returnFieldsByFieldId','true'); q.set('pageSize','100');
    if(offset) q.set('offset', offset);
    const d = await at(BASE+'/'+table+'?'+q.toString());
    recs = recs.concat(d.records); offset = d.offset;
  } while(offset);
  return recs;
}
async function writeLog(records){
  for(let i=0;i<records.length;i+=10){
    await at(BASE+'/'+T_LOG, { method:'POST', body:JSON.stringify({ records:records.slice(i,i+10), typecast:true }) });
  }
}
async function writeNotifs(records){
  for(let i=0;i<records.length;i+=10){
    await at(BASE+'/'+T_NOTIF, { method:'POST', body:JSON.stringify({ records:records.slice(i,i+10), typecast:true }) });
  }
}
// Send an email straight from the app via Resend (https://resend.com). Stays a
// no-op until RESEND_API_KEY is set in Netlify, so notifications work in-app
// regardless. No npm dependency — just a fetch.
const RESEND_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM  = process.env.MAIL_FROM || 'JV National Ministries <onboarding@resend.dev>';
async function sendEmail(to, subject, message, link){
  if(!RESEND_KEY || !to) return;
  const btn = link ? `<p style="margin:22px 0"><a href="${link}" style="background:#FF6600;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-family:sans-serif;font-size:15px">Open your page</a></p>` : '';
  const html = `<div style="font-family:sans-serif;font-size:15px;color:#1E2A24;line-height:1.6;max-width:520px">
    <p>${message}</p>${btn}
    <p style="color:#5A655C;font-size:12.5px;margin-top:24px">Josiah Venture · National Ministries</p></div>`;
  try{
    await fetch('https://api.resend.com/emails', { method:'POST',
      headers:{ Authorization:'Bearer '+RESEND_KEY, 'Content-Type':'application/json' },
      body: JSON.stringify({ from:MAIL_FROM, to:[to], subject, html }) });
  }catch(e){ /* email is best-effort; never block */ }
}
const usd = n => '$'+Math.round(Number(n)||0).toLocaleString('en-US');

// Fan out tailored notifications for a pipeline event. The app writes one
// Notification record per recipient (with a link to their page); a single
// Airtable automation emails each new record. Same event → different message
// for each person.
const PNF = { name:'fld1qi35letQtg6yC', country:'fldpZ00pUwm1gB4zN', awarded:'fldeeQMQPRVyXbklW',
              leaderEmail:'fldbs0FzyPWbS1waI', submitterEmail:'fld64OxiMWtnko2H7', coachEmail:'fld4lLrDwB5x0ck72',
              decisionMsg:'fldt1Hu5YY1ZvvqMD' };
async function roleEmails(roles){
  try{
    const ppl = await fetchAll(T_APP, {});
    return ppl.filter(p => roles.includes((p.fields[A.role]||'').trim()))
              .map(p => (p.fields[A.email]||'').trim()).filter(Boolean);
  }catch(e){ return []; }
}
const councilEmails = () => roleEmails(['EVP','President']);
async function notifyEvent(event, recordId, opts={}){
  const rec = await at(BASE+'/'+T_PROP+'/'+recordId+'?returnFieldsByFieldId=true');
  const f = rec.fields || {};
  const name = f[PNF.name] || 'a grant', country = f[PNF.country] || '', amt = usd(f[PNF.awarded]);
  const leader = (f[PNF.leaderEmail] || f[PNF.submitterEmail] || '').trim();
  const coach  = (f[PNF.coachEmail] || '').trim();
  const decisionMsg = f[PNF.decisionMsg] || '';
  const where = country ? ` (${country})` : '';

  const notifs = [];
  const add = (email, msg, type) => { if(email) notifs.push({ fields:{ [N.email]:email, [N.msg]:msg, [N.type]:type||'Decision', [N.prop]:[recordId], [N.link]:SITE_URL } }); };

  if(event === 'coach_submit'){
    const council = await councilEmails();
    council.forEach(e => add(e, `Ready to decide: ${coach||'a coach'} submitted their review of "${name}"${where}.`, 'Decision'));
  } else if(event === 'decision'){
    const council = await councilEmails();
    if(opts.kind === 'deny'){
      add(leader, `Your grant "${name}" was not approved. Open your page to read the Council Lead Team's note${decisionMsg?`: “${decisionMsg}”`:'.'}`, 'Decision');
    } else if(opts.kind === 'defer'){
      add(leader, `"${name}" was approved but deferred to a later cycle. Confirm on your page that you still want it.`, 'Decision');
    } else { // approve
      add(leader, `Good news — "${name}" was approved by the Council Lead Team${amt!=='$0'?` for ${amt}`:''}.`, 'Decision');
      council.forEach(e => add(e, `Approved: "${name}"${where} — now with the grant team to fund.`, 'Decision'));
    }
  } else if(event === 'funding_followup'){
    // Grant team asks whether an approved-but-unfunded project still needs money.
    const council = await councilEmails();
    council.forEach(e => add(e, `Still needed? "${name}"${where} was approved but is still waiting on funding. Please check whether the money is still needed, or if it has waited long enough that it no longer is.`, 'Decision'));
    add(coach, `Can you follow up on "${name}"${where}? It was approved but funding hasn't been found yet — is the money still needed, or has it been too long?`, 'Decision');
  } else if(event === 'cleared'){
    const team = await roleEmails(['Grant team']);
    team.forEach(e => add(e, `Cleared to transfer: "${name}"${where} — ${amt} is ready to send to the country's Cedarstone account.`, 'Transfer'));
  } else if(event === 'transfer'){
    const council = await councilEmails();
    council.forEach(e => add(e, `Funds sent: "${name}"${where} — ${amt} transferred to the country's Cedarstone account.`, 'Transfer'));
    add(leader, `Your grant "${name}" has been funded — ${amt} is on its way to your account.`, 'Transfer');
    add(coach,  `"${name}"${where}, which you reviewed, has been funded — ${amt} sent.`, 'Transfer');
  }
  if(notifs.length){
    await writeNotifs(notifs);
    for(const n of notifs){
      const type = n.fields[N.type];
      const subject = type === 'Transfer' ? 'Your JV grant has been funded'
        : event === 'funding_followup' ? 'Is this grant still needed?'
        : (opts.kind === 'deny') ? 'An update on your JV grant application'
        : type === 'Decision' ? 'An update on your JV grant'
        : 'JV National Ministries';
      await sendEmail(n.fields[N.email], subject, n.fields[N.msg], n.fields[N.link]);
    }
  }
}

// ── Foundation report ─────────────────────────────────────────────────────────
// Gathers everything an outward-facing stewardship report needs for one grant
// cycle: the gift, how it was used, impact numbers vs. the foundation's goals,
// and the narrative field-reports (impact stories, lessons, progress) written by
// the country teams. Joins are by record-id link, never by name.
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const RF = { proposal:'fldWLpL3N2yIRfn0t', cycle:'fldKa2XwRf3vLTdhW', type:'fldVK0eF1dBGNnMG0',
  completedBy:'fldemspw6LSoGMnIQ', story:'fldoOYDPd2tbnzvgC', challenges:'fldqkWPn3hAFQXoFu',
  lessons:'fldpM9VAWPVjMeUCm', nextSteps:'fld8gyR2KNGkiDG44', comments:'fldrm8Cyk8Z1lA1vy',
  spent:'fld25e4OC4ObhbyZw', people:'fldisUoMECHpHZwp5', leaders:'fldP8DjBL1S5l1WWA', churches:'fldkksYMIC3YMdsNx',
  prog1:'fldFhbKWiC1KjMiMh', prog2:'fldxr8mGkdALSFJPW', prog3:'fld53pqkxduIIDSzM',
  attachments:'fldN6cvQXDhM9aCpX' };
const CYF = { name:'fld4xy7sYr8vl8dNj', foundation:'fldnNt8n0RNqdSccO', total:'fldw0BPZ4mU0GwiXz' };
const PPF = { name:'fld1qi35letQtg6yC', country:'fldpZ00pUwm1gB4zN', awarded:'fldeeQMQPRVyXbklW',
  requested:'fld3bvuKr1SIXAwUf', stage:STAGE_F, cycles:'flda02NPGg4TFd8wp' };
const GLF = { type:'fldynRy5JVc8MHzmn', target:'fldC8KQzgngaBtmmL', actual:'fldrzoRt4JsDZb8gQ', cycle:'fldvzwukj9URXZoG7' };
const sname = x => (x && (x.name || (typeof x === 'string' ? x : ''))) || '';
const nnum  = x => { const n = Number(x); return isNaN(n) ? 0 : n; };
const linkHas = (v, id) => Array.isArray(v) && v.some(x => (((x && x.id) ? x.id : x)) === id);

async function gatherCycle(cycleId){
  const cycleRec = await at(BASE+'/'+T_CYCLE+'/'+cycleId+'?returnFieldsByFieldId=true');
  const cf = cycleRec.fields || {};
  const [allProps, allReports, allGoals] = await Promise.all([
    fetchAll(T_PROP, {}), fetchAll(T_REPORT, {}), fetchAll(T_GOALS, {})
  ]);
  const props   = allProps.filter(p => linkHas(p.fields[PPF.cycles], cycleId));
  const reports = allReports.filter(r => linkHas(r.fields[RF.cycle], cycleId));
  const goals   = allGoals.filter(g => linkHas(g.fields[GLF.cycle], cycleId));
  const propById = Object.fromEntries(props.map(p => [p.id, p]));

  const funded = props.filter(p => sname(p.fields[PPF.stage]) === 'Funded');
  const countries = [...new Set(props.map(p => (p.fields[PPF.country] || '').toString().trim()).filter(Boolean))].sort();

  const projects = props.map(p => ({
    name: p.fields[PPF.name] || '(untitled)',
    country: (p.fields[PPF.country] || '').toString(),
    awarded: nnum(p.fields[PPF.awarded]),
    requested: nnum(p.fields[PPF.requested]),
    stage: sname(p.fields[PPF.stage]),
  })).sort((a, b) => b.awarded - a.awarded);

  const stories = reports.map(r => {
    const rf = r.fields || {};
    const link = rf[RF.proposal] || [];
    const propId = (Array.isArray(link) && link.length) ? (((link[0] && link[0].id) ? link[0].id : link[0])) : '';
    const p = propById[propId];
    const objectives = [rf[RF.prog1], rf[RF.prog2], rf[RF.prog3]].map(x => (x || '').trim()).filter(Boolean);
    // Up to 3 photos from the report's Supporting Attachments (images only).
    // NOTE: Airtable attachment URLs expire after a couple hours — fine for a
    // report generated and viewed/printed now; add a proxy (like budget_file)
    // if we ever need long-lived links.
    const atts = Array.isArray(rf[RF.attachments]) ? rf[RF.attachments] : [];
    const photos = atts.filter(a => /^image\//i.test(a && a.type || ''))
      .slice(0, 3).map(a => (a.thumbnails && a.thumbnails.large && a.thumbnails.large.url) || a.url).filter(Boolean);
    return {
      name: p ? (p.fields[PPF.name] || '') : '(a funded project)',
      country: p ? (p.fields[PPF.country] || '').toString() : '',
      kind: /final/i.test(sname(rf[RF.type])) ? 'Final' : /mid/i.test(sname(rf[RF.type])) ? 'Mid' : sname(rf[RF.type]),
      completedBy: rf[RF.completedBy] || '',
      story: (rf[RF.story] || '').trim(),
      challenges: (rf[RF.challenges] || '').trim(),
      lessons: (rf[RF.lessons] || '').trim(),
      nextSteps: (rf[RF.nextSteps] || '').trim(),
      comments: (rf[RF.comments] || '').trim(),
      objectives, photos,
      leaders: nnum(rf[RF.leaders]), churches: nnum(rf[RF.churches]), people: nnum(rf[RF.people]),
    };
  }).filter(s => s.story || s.lessons || s.challenges || s.nextSteps || s.comments || s.objectives.length);

  const goalRows = goals.map(g => {
    const type = sname(g.fields[GLF.type]);
    const rollup = nnum(g.fields[GLF.actual]);
    return { type, target: nnum(g.fields[GLF.target]), actual: /project/i.test(type) ? funded.length : rollup };
  }).sort((a, b) => b.target - a.target);

  const sumReports = key => reports.reduce((a, r) => a + nnum(r.fields[RF[key]]), 0);

  return {
    cycle: { id: cycleId, foundation: sname(cf[CYF.foundation]) || 'This foundation', year: cf[CYF.name] || '', gift: nnum(cf[CYF.total]) },
    totals: {
      awarded: props.reduce((a, p) => a + nnum(p.fields[PPF.awarded]), 0),
      projectCount: props.length, fundedCount: funded.length, countryCount: countries.length,
      leaders: sumReports('leaders'), churches: sumReports('churches'), people: sumReports('people'),
    },
    countries, goals: goalRows, projects, stories,
  };
}

// Ask Claude to write the donor-facing impact narrative from the field reports.
// Guarded: a no-op returning null until ANTHROPIC_API_KEY is set in Netlify.
async function writeImpactSummary(data){
  if(!ANTHROPIC_KEY) return null;
  const t = data.totals || {}, c = data.cycle || {};
  const stories = (data.stories || []).slice(0, 40).map(s => {
    const parts = [`PROJECT: ${s.name}${s.country ? ' — ' + s.country : ''}`];
    if(s.story)      parts.push(`Impact story: ${s.story}`);
    if(s.objectives && s.objectives.length) parts.push(`Progress: ${s.objectives.join(' | ')}`);
    if(s.lessons)    parts.push(`Lessons learned: ${s.lessons}`);
    if(s.challenges) parts.push(`Challenges: ${s.challenges}`);
    return parts.join('\n');
  }).join('\n\n');
  const facts = `The foundation is "${c.foundation}". Their grant for ${c.year || 'this cycle'} was ${usd(c.gift)}. `
    + `It funded ${t.fundedCount} project(s) across ${t.countryCount} countries. `
    + `Across the field reports, the funded work has so far impacted ${t.leaders} leaders, ${t.churches} churches, and ${t.people} people.`;
  const prompt = `You are writing a warm, sincere impact/stewardship report addressed directly to a foundation that gave money to Josiah Venture's national ministry work in Central and Eastern Europe. The purpose is to help the foundation see how their gift was used and the real impact it made possible.

Facts you may use (do not invent numbers or facts beyond these and the reports):
${facts}

Field reports from the country teams:
${stories || '(No narrative field reports were submitted yet.)'}

Write 3–4 short paragraphs, addressed to the foundation ("your gift", "because of your partnership"). (1) Open with genuine thanks. (2) Tell the story of the impact their money made possible, in human terms, drawing specifics from the reports above. (3) Name one or two specific projects or moments from the reports. (4) Close with gratitude and a note of shared mission. Warm and sincere, not flowery or salesy. Plain text only — no headings, no markdown, no bullet points.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus-5', max_tokens: 1800, output_config: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }] }),
  });
  const d = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error((d.error && d.error.message) || 'The AI summary service returned an error.');
  return (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

// ── Strategic fit check ───────────────────────────────────────────────────────
// Country strategic-plan fields + the cached AI fit assessment on proposals.
const CTRY_PLAN_F = 'fld9vFYV81T4UARpR', CTRY_PLAN_UPD_F = 'fldQvhpdcIYJwEhHf', CTRY_NAME_F = 'fldzgWM7sqaFDM4Cl';
const FIT_F = 'fldD7E2IXEeLM3oMF';

// Generate and save the strategic-fit read for one proposal against its
// country's current plan. Returns the text, or null when there's no plan,
// no linked country, or no API key. An aid to the coach and Council Lead
// Team — mapped to the plan's own objectives, with honest gaps and
// questions — never a score or a decision.
async function runFitCheck(recordId){
  if(!ANTHROPIC_KEY) return null;
  const rec = await at(BASE+'/'+T_PROP+'/'+recordId+'?returnFieldsByFieldId=true');
  const f = rec.fields || {};
  const link = f[PROP_COUNTRY_LINK];
  const countryId = (Array.isArray(link) && link.length) ? (link[0].id || link[0]) : '';
  if(!countryId) return null;
  const ctry = await at(BASE+'/'+T_COUNTRIES+'/'+countryId+'?returnFieldsByFieldId=true');
  const plan = ((ctry.fields && ctry.fields[CTRY_PLAN_F]) || '').trim();
  if(!plan) return null;
  const P = { name:'fld1qi35letQtg6yC', requested:'fld3bvuKr1SIXAwUf', budget:'fldofeeQU3DlrHULR',
    problem:'fldb0TRzRi1nzkN7v', fit:'fldTa8BUePK8Ifs02', people:'fld8CdQ8Ens5m3NDs',
    leaders:'fldc2XplvqvAX8NlX', churches:'fld6ZWqZuuK9gcfab',
    objective:'fld17fOaX3yAe3s4O', objective2:'fld2tSgq12UOBDMri', objective3:'fldquJXeXakScgMnU',
    success:'fldQKLTpf2M69gneF', start:'fldVIJKaXqmUw8qFP', end:'fldxV1o8EVEXaitod' };
  const g = k => { const v = f[P[k]]; return v == null ? '' : (v.name || v); };
  const app = [
    `Project: ${g('name')}`,
    `Requested: $${g('requested')} of a $${g('budget')||g('requested')} total budget`,
    `Timeline: ${g('start')||'?'} to ${g('end')||'?'}`,
    `Need it addresses: ${g('problem')}`,
    `Objectives: ${[g('objective'),g('objective2'),g('objective3')].filter(Boolean).join(' | ') || '(none given)'}`,
    `Success looks like: ${g('success')}`,
    `Impact targets: ${g('people')||0} people, ${g('leaders')||0} leaders, ${g('churches')||0} churches`,
    `The applicant's own strategic-fit claim: ${g('fit')}`,
  ].join('\n');
  const prompt = `You are helping Josiah Venture's Council Lead Team and country coaches judge how a grant application fits the country's current strategic plan. Be specific and honest — name the plan's actual objectives/key results the project supports, say plainly where it does NOT obviously fit, and never invent anything that isn't in the plan or the application.

THE COUNTRY'S STRATEGIC PLAN:
${plan.slice(0, 20000)}

THE GRANT APPLICATION:
${app}

Write plain text (no markdown) in exactly this shape:
Line 1: "Fit: <Strong|Good|Partial|Weak> — <one short phrase why>"
Then a blank line, then "Where it lands in the plan:" followed by 2-4 sentences naming the specific objectives, key results, or program goals this supports, quoting the plan's own wording where possible, and noting any part of the plan the project ignores or duplicates.
Then a blank line, then "Worth asking:" followed by 1-3 pointed questions the council or coach should raise with the country. Keep the whole thing under 180 words.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'x-api-key':ANTHROPIC_KEY, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
    body: JSON.stringify({ model:'claude-opus-5', max_tokens:900, output_config:{ effort:'low' },
      messages:[{ role:'user', content:prompt }] }),
  });
  const d = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error((d.error && d.error.message) || 'The fit-check service returned an error.');
  const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if(text) await at(BASE+'/'+T_PROP+'/'+recordId, { method:'PATCH', body:JSON.stringify({ fields:{ [FIT_F]:text }, typecast:true }) });
  return text || null;
}

exports.handler = async (event) => {
  // ---- BUDGET FILE PROXY (GET, serves the attachment through our own domain so ad/content blockers don't block it) ----
  if(event.httpMethod === 'GET'){
    const qs = event.queryStringParameters || {};
    if(qs.op === 'budget_file'){
      if(!TOKEN) return { statusCode:500, headers:{'Content-Type':'text/plain'}, body:'Server missing AIRTABLE_TOKEN' };
      const recId = qs.rec || ''; const idx = parseInt(qs.i||'0',10) || 0;
      if(!/^rec[A-Za-z0-9]{14}$/.test(recId)) return { statusCode:400, headers:{'Content-Type':'text/plain'}, body:'Bad record id' };
      try{
        const rec = await at(BASE+'/'+T_PROP+'/'+recId+'?returnFieldsByFieldId=true');
        const files = (rec.fields && rec.fields['fld3cTDxR62CssdGY']) || [];
        if(!Array.isArray(files) || !files[idx]) return { statusCode:404, headers:{'Content-Type':'text/plain'}, body:'No budget file found.' };
        const f = files[idx];
        const fr = await fetch(f.url);
        if(!fr.ok) return { statusCode:502, headers:{'Content-Type':'text/plain'}, body:'Could not load the budget file.' };
        const buf = Buffer.from(await fr.arrayBuffer());
        const ctype = f.type || fr.headers.get('content-type') || 'application/octet-stream';
        const fname = (f.filename||'budget').replace(/["\r\n]/g,'');
        const inline = /pdf|image\//i.test(ctype);
        return {
          statusCode:200,
          headers:{
            'Content-Type':ctype,
            'Content-Disposition':(inline?'inline':'attachment')+'; filename="'+fname+'"',
            'Cache-Control':'private, max-age=300'
          },
          body: buf.toString('base64'),
          isBase64Encoded:true
        };
      }catch(e){ return { statusCode:500, headers:{'Content-Type':'text/plain'}, body:'Error loading budget: '+(e&&e.message||'unknown') }; }
    }
    return reply(405, { error:'POST only' });
  }
  if(event.httpMethod !== 'POST') return reply(405, { error:'POST only' });
  if(!TOKEN)  return reply(500, { error:'Server is missing the AIRTABLE_TOKEN environment variable.' });
  if(!SECRET) return reply(500, { error:'Server is missing the SESSION_SECRET environment variable.' });

  let body; try{ body = JSON.parse(event.body||'{}'); }catch(e){ return reply(400, { error:'Bad request body.' }); }

  // ---- LOGIN (no token required) ----
  if(body.op === 'login'){
   try{
    const email = (body.email||'').trim().toLowerCase();
    const password = body.password||'';
    if(!email || !password) return reply(400, { error:'Email and password are required.' });
    const people = await fetchAll(T_APP, {});
    const rec = people.find(p => ((p.fields[A.email]||'').trim().toLowerCase()) === email);
    if(!rec) return reply(401, { error:'Email or password not recognized.' });
    const name = rec.fields[A.name] || rec.fields[A.email] || email;
    const salt = rec.fields[A.salt], hash = rec.fields[A.hash];
    let firstTime = false;
    if(!salt || !hash){
      // first sign-in: set their password now
      const newSalt = crypto.randomBytes(16).toString('hex');
      const newHash = hashPw(password, newSalt);
      await at(BASE+'/'+T_APP+'/'+rec.id, { method:'PATCH', body:JSON.stringify({ fields:{ [A.salt]:newSalt, [A.hash]:newHash } }) });
      firstTime = true;
    } else {
      if(!eqStr(hashPw(password, salt), hash)) return reply(401, { error:'Email or password not recognized.' });
    }
    const user = attachScope({ email: rec.fields[A.email] || email, name }, rec);
    try{
      await writeLog([{ fields:{ [L.entry]:name+' signed in', [L.type]:'Login',
        [L.detail]: firstTime ? 'Set password and signed in' : 'Signed in', [L.user]:name, [L.email]:user.email } }]);
    }catch(logErr){ /* logging is best-effort; never block sign-in */ }
    return reply(200, { token: makeToken(user), user, firstTime });
   }catch(e){
    return reply(500, { error: 'Sign-in failed: ' + (e && e.message ? e.message : 'unknown error') });
   }
  }

  // ---- TRAVEL FUND: public ops (no login needed — leaders submit requests) ----
  if(body.op === 'travel_submit'){
   try{
    const f = body.fields || {};
    const name = (f.name||'').trim(), email = (f.email||'').trim();
    const reqAmt = Number(f.reqAmt);
    if(!name || !email) return reply(400, { error:'Please include your name and email.' });
    if(!reqAmt || reqAmt<=0) return reply(400, { error:'Please enter the amount you are requesting.' });
    const fields = {
      [TR.name]:name, [TR.email]:email,
      [TR.team]:(f.team||'').trim(), [TR.purpose]:(f.purpose||'').trim(),
      [TR.reqAmt]:reqAmt, [TR.status]:'Submitted'
    };
    if(f.depart) fields[TR.depart]=f.depart;
    if(f.ret)    fields[TR.ret]=f.ret;
    if(f.notes)  fields[TR.notes]=(f.notes||'').trim();
    if(f.timing) fields[TR.timing]=f.timing;
    if(f.actualCost!=null && f.actualCost!=='') fields[TR.actual]=Number(f.actualCost);
    await at(BASE+'/'+T_TRAVEL, { method:'POST', body:JSON.stringify({ records:[{fields}], typecast:true }) });
    return reply(200, { ok:true });
   }catch(e){ return reply(500, { error:'Could not submit your request: ' + (e && e.message ? e.message : 'unknown error') }); }
  }

  if(body.op === 'travel_fund_status'){
   try{
    const [funds, travel] = await Promise.all([ fetchAll(T_FUNDS, {}), fetchAll(T_TRAVEL, {}) ]);
    const total = funds.filter(r=>/Restricted/i.test((r.fields[FUND_STAT_F]&&(r.fields[FUND_STAT_F].name||r.fields[FUND_STAT_F]))||'')).reduce((a,r)=>a+(r.fields[FUND_AMT_F]||0),0);
    const isCommitted = s => /Approved|Paid/i.test(s||'');
    const approved = travel.filter(r=>isCommitted((r.fields[TR.status]&&(r.fields[TR.status].name||r.fields[TR.status]))||'')).reduce((a,r)=>a+(r.fields[TR.appAmt]||r.fields[TR.reqAmt]||0),0);
    return reply(200, { total, approved, remaining: total-approved });
   }catch(e){ return reply(500, { error:e.message }); }
  }

  // ---- everything else requires a valid token ----
  const authz = event.headers && (event.headers.authorization || event.headers.Authorization) || '';
  const who = verifyToken(authz.replace(/^Bearer\s+/i, ''));
  if(!who) return reply(401, { error:'Session expired — please sign in again.' });
  // Tokens issued before roles were embedded won't carry a role; refresh it from
  // Approvers so enforcement is correct without forcing everyone to re-sign-in.
  if(who && !who.role){
    try{
      const ppl = await fetchAll(T_APP, {});
      const me = ppl.find(p => ((p.fields[A.email]||'').trim().toLowerCase()) === ((who.email||'').trim().toLowerCase()));
      if(me) attachScope(who, me);
    }catch(e){ /* leave who as-is */ }
  }

  try{
    if(body.op === 'bootstrap'){
      const safe = async (p) => { try { return await p; } catch(e){ return []; } };
      const [cycles, props, funds, balRecs] = await Promise.all([
        fetchAll(T_CYCLE, {}),
        fetchAll(T_PROP, { 'sort[0][field]':PROP_CREATED, 'sort[0][direction]':'desc' }),
        fetchAll(T_FUNDS, {}),
        fetchAll(T_BAL, {})
      ]);
      // non-critical: never let these crash the whole bootstrap
      const goals = await safe(fetchAll(T_GOALS, {}));
      // Attach the signed-in user's role + country scope, read from Approvers.
      const peopleRecs = await safe(fetchAll(T_APP, {}));
      const meRec = peopleRecs.find(p => ((p.fields[A.email]||'').trim().toLowerCase()) === ((who.email||'').trim().toLowerCase()));
      if(meRec) attachScope(who, meRec);
      const logRecs = await safe(fetchAll(T_LOG, {}));
      const countryRecs = await safe(fetchAll(T_COUNTRIES, {}));
      const reportRecs = await safe(fetchAll(T_REPORT, {}));
      const reports = reportRecs.map(r => {
        const link = r.fields['fldWLpL3N2yIRfn0t'];
        const t = r.fields['fldVK0eF1dBGNnMG0'];
        const completedBy = r.fields['fldemspw6LSoGMnIQ'] || '';
        return {
          id: r.id,
          proposalId: (Array.isArray(link) && link.length) ? link[0] : '',
          type: (t && (t.name || (typeof t === 'string' ? t : ''))) || '',
          due: r.fields['fldkjC4V3NmC4ylDy'] || '',
          submitted: r.fields['fldTytlPqwAo01YtX'] || '',
          completedBy,
          done: !!completedBy,                 // reliable "actually submitted" signal
          leaders: r.fields['fldP8DjBL1S5l1WWA'] || 0,
          churches: r.fields['fldkksYMIC3YMdsNx'] || 0,
          people: r.fields['fldisUoMECHpHZwp5'] || 0
        };
      }).filter(x => x.proposalId);
      const countries_meta = countryRecs.map(r => {
        const ph = r.fields['flduog58oXfNq2aEt'];
        return {
          id: r.id,
          name: r.fields['fldzgWM7sqaFDM4Cl'] || '',
          phase: (ph && (ph.name || (typeof ph === 'string' ? ph : ''))) || '',
          hasPlan: !!((r.fields[CTRY_PLAN_F] || '').trim()),
          planUpdated: r.fields[CTRY_PLAN_UPD_F] || ''
        };
      }).filter(c => c.name);
      const logs = logRecs.map(r => ({
        id:r.id, at:r.createdTime, type:v(r.fields[L.type])||'',
        detail:r.fields[L.detail]||r.fields[L.entry]||'',
        user:r.fields[L.user]||'', proposalId:r.fields[L.pid]||''
      })).sort((a,b)=> new Date(b.at)-new Date(a.at)).slice(0,80);
      const bal = balRecs.length ? { account:balRecs[0].fields['fldkVMZNye4ZFkUtK']||'', balance:balRecs[0].fields['fld8Bv81lUPaMEAxS']||0, asOf:balRecs[0].fields['fld4Wy34J0iJjqGCC']||'' } : null;
      const travelRecs = await safe(fetchAll(T_TRAVEL, {}));
      const travel = travelRecs.map(r => ({
        id:r.id, name:r.fields[TR.name]||'', email:r.fields[TR.email]||'', team:r.fields[TR.team]||'',
        purpose:r.fields[TR.purpose]||'', depart:r.fields[TR.depart]||'', ret:r.fields[TR.ret]||'',
        reqAmt:r.fields[TR.reqAmt]||0, appAmt:r.fields[TR.appAmt]||0,
        timing:(r.fields[TR.timing]&&(r.fields[TR.timing].name||r.fields[TR.timing]))||'',
        actual:r.fields[TR.actual]||0,
        status:(r.fields[TR.status]&&(r.fields[TR.status].name||r.fields[TR.status]))||'Submitted'
      }));
      // ---- scope for country leaders (their countries only) ----
      if(isScopedCountry(who)){
        const allowed = new Set(who.countryIds||[]);
        const mineProps = props.filter(p => { const l = p.fields[PROP_COUNTRY_LINK]; return Array.isArray(l) && l.some(id => allowed.has(id)); });
        const mineIds = new Set(mineProps.map(p => p.id));
        const mineReports = reports.filter(r => mineIds.has(r.proposalId));
        // scoped users get their own grants + reports + their own country; sensitive aggregates withheld
        const myCountries = countries_meta.filter(c => allowed.has(c.id));
        return reply(200, { cycles, props:mineProps, logs:[], funds:[], bal:null, goals, countries_meta:myCountries, reports:mineReports, travel:[], user:who });
      }
      return reply(200, { cycles, props, logs, funds, bal, goals, countries_meta, reports, travel, user:who });
    }

    if(body.op === 'people_list'){
      if(!isOversight(who)) return reply(403, { error:'Not permitted.' });
      const people = await fetchAll(T_APP, {});
      return reply(200, { people: people.map(r => ({
        id:r.id,
        email:r.fields[A.email]||'',
        name:r.fields[A.name]||'',
        role:r.fields[A.role]||'',
        countries: Array.isArray(r.fields[A.countries]) ? r.fields[A.countries] : [],
        allCountries: !!r.fields[A.allCountries],
        hasPassword: !!(r.fields[A.salt] && r.fields[A.hash])
      })), user:who });
    }

    if(body.op === 'people_update'){
      if(!isOversight(who)) return reply(403, { error:'Not permitted.' });
      if(!body.recordId) return reply(400, { error:'Missing recordId.' });
      const f = body.fields || {};
      const fields = {};
      if(f.name != null) fields[A.name] = String(f.name).trim();
      if(f.role != null) fields[A.role] = String(f.role).trim();
      if(f.allCountries != null) fields[A.allCountries] = !!f.allCountries;
      if(Array.isArray(f.countries)) fields[A.countries] = f.countries;
      const upd = await at(BASE+'/'+T_APP+'/'+body.recordId, { method:'PATCH', body:JSON.stringify({ fields, typecast:true }) });
      try{ await writeLog([{ fields:{ [L.entry]:'Updated access for '+((upd.fields&&upd.fields[A.email])||body.recordId), [L.type]:'Login',
        [L.detail]:(who.name||who.email)+' updated a person\'s role/access', [L.user]:who.name||'', [L.email]:who.email||'' } }]); }catch(e){}
      return reply(200, { ok:true, user:who });
    }

    if(body.op === 'people_add'){
      if(!isOversight(who)) return reply(403, { error:'Not permitted.' });
      const f = body.fields || {};
      const emailRaw = (f.email||'').trim();
      const email = emailRaw.toLowerCase();
      if(!email) return reply(400, { error:'Email is required.' });
      const existing = await fetchAll(T_APP, {});
      if(existing.some(p => ((p.fields[A.email]||'').trim().toLowerCase()) === email))
        return reply(400, { error:'Someone with that email already exists.' });
      const fields = { [A.email]:emailRaw, [A.name]:(f.name||'').trim() };
      if(f.role) fields[A.role] = String(f.role).trim();
      if(f.allCountries != null) fields[A.allCountries] = !!f.allCountries;
      if(Array.isArray(f.countries) && f.countries.length) fields[A.countries] = f.countries;
      const created = await at(BASE+'/'+T_APP, { method:'POST', body:JSON.stringify({ records:[{fields}], typecast:true }) });
      const id = created.records && created.records[0] && created.records[0].id;
      try{ await writeLog([{ fields:{ [L.entry]:'Added person '+emailRaw, [L.type]:'Login',
        [L.detail]:(who.name||who.email)+' added '+((f.name||'').trim()||emailRaw)+' ('+emailRaw+')', [L.user]:who.name||'', [L.email]:who.email||'' } }]); }catch(e){}
      return reply(200, { ok:true, id, user:who });
    }

    if(body.op === 'people_reset'){
      if(!ADMINS.includes((who.email||'').trim().toLowerCase()))
        return reply(403, { error:'Only an administrator can reset sign-ins.' });
      if(!body.recordId) return reply(400, { error:'Missing recordId.' });
      const target = await at(BASE+'/'+T_APP+'/'+body.recordId+'?returnFieldsByFieldId=true');
      const tEmail = (target.fields && target.fields[A.email]) || '(unknown)';
      await at(BASE+'/'+T_APP+'/'+body.recordId, { method:'PATCH', body:JSON.stringify({ fields:{ [A.salt]:'', [A.hash]:'' } }) });
      try{
        await writeLog([{ fields:{ [L.entry]:'Sign-in reset for '+tEmail, [L.type]:'Login',
          [L.detail]:(who.name||who.email)+' reset the sign-in for '+tEmail, [L.user]:who.name||'', [L.email]:who.email||'' } }]);
      }catch(logErr){ /* best effort */ }
      return reply(200, { ok:true, email:tEmail, user:who });
    }

    if(body.op === 'travel_update'){
      if(!body.recordId || !body.fields) return reply(400, { error:'Missing recordId or fields.' });
      const upd = await at(BASE+'/'+T_TRAVEL+'/'+body.recordId, { method:'PATCH', body:JSON.stringify({ fields:body.fields, typecast:true }) });
      return reply(200, { fields:upd.fields, user:who });
    }

    if(body.op === 'update'){
      if(!body.recordId || !body.fields) return reply(400, { error:'Missing recordId or fields.' });
      // Scope: a country leader may only update grants for their own countries.
      if(isScopedCountry(who)){
        const cur = await at(BASE+'/'+T_PROP+'/'+body.recordId+'?returnFieldsByFieldId=true');
        if(!inScope(who, cur.fields)) return reply(403, { error:'You can only update grants for your own country.' });
      }
      // Keep legacy Status in sync when the canonical Stage changes.
      if(body.fields[STAGE_F] && STAGE_TO_STATUS[body.fields[STAGE_F]]) body.fields[STATUS_F] = STAGE_TO_STATUS[body.fields[STAGE_F]];
      const upd = await at(BASE+'/'+T_PROP+'/'+body.recordId, { method:'PATCH', body:JSON.stringify({ fields:body.fields, typecast:true }) });
      const changes = Array.isArray(body.changes) ? body.changes : [];
      if(changes.length){
        try{
          await writeLog(changes.map(c => ({ fields:{
            [L.entry]:(body.projectName ? body.projectName+' — ' : '') + (c.label||'change'),
            [L.type]: c.type || 'Status change',
            [L.detail]: c.detail || c.label || '',
            [L.user]: who.name, [L.email]: who.email,
            [L.pid]: body.recordId, 'fldDCLcDUyODA0AvP':[body.recordId]
          }})));
        }catch(logErr){ /* logging is best-effort; never block the approval */ }
      }
      // Fan out notifications for pipeline handoffs (transfer, decision, coach submit…).
      if(body.notify && body.notify.event){
        try{ await notifyEvent(body.notify.event, body.recordId, body.notify); }catch(notifErr){ /* never block the update */ }
      }
      return reply(200, { fields:upd.fields, user:who });
    }

    if(body.op === 'notifications'){
      const recs = await fetchAll(T_NOTIF, {});
      const mine = recs.filter(r => ((r.fields[N.email]||'').trim().toLowerCase()) === ((who.email||'').trim().toLowerCase()));
      const out = mine.map(r => ({ id:r.id, at:r.createdTime, message:r.fields[N.msg]||'',
        type:v(r.fields[N.type])||'', read:!!r.fields[N.read],
        propId:(Array.isArray(r.fields[N.prop]) && r.fields[N.prop].length) ? (r.fields[N.prop][0].id || r.fields[N.prop][0]) : '' }))
        .sort((a,b)=> new Date(b.at)-new Date(a.at)).slice(0,50);
      return reply(200, { notifications:out, unread:out.filter(n=>!n.read).length, user:who });
    }

    if(body.op === 'notif_read'){
      const ids = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);
      for(let i=0;i<ids.length;i+=10){
        await at(BASE+'/'+T_NOTIF, { method:'PATCH', body:JSON.stringify({ records: ids.slice(i,i+10).map(id=>({ id, fields:{ [N.read]:true } })), typecast:true }) });
      }
      return reply(200, { ok:true, user:who });
    }

    if(body.op === 'set_balance'){
      // Update the account balance from the monthly CSV reconcile (EVP/Management).
      if(!canBalance(who)) return reply(403, { error:'Only EVP can update the account balance.' });
      if(body.balance == null) return reply(400, { error:'Missing balance.' });
      const B = { account:'fldkVMZNye4ZFkUtK', balance:'fld8Bv81lUPaMEAxS', asOf:'fld4Wy34J0iJjqGCC', note:'fld29bXKDcudyG0SZ' };
      const fields = { [B.balance]:Number(body.balance) };
      if(body.asOf) fields[B.asOf] = body.asOf;
      if(body.note != null) fields[B.note] = String(body.note);
      const existing = await fetchAll(T_BAL, {});
      let rec;
      if(existing.length){
        rec = await at(BASE+'/'+T_BAL+'/'+existing[0].id, { method:'PATCH', body:JSON.stringify({ fields, typecast:true }) });
      } else {
        if(!fields[B.account]) fields[B.account] = '510181 - National Expansion Projects';
        const created = await at(BASE+'/'+T_BAL, { method:'POST', body:JSON.stringify({ records:[{fields}], typecast:true }) });
        rec = created.records && created.records[0];
      }
      try{
        await writeLog([{ fields:{ [L.entry]:'Account balance updated', [L.type]:'Status change',
          [L.detail]:(who.name||who.email)+' set the account balance to $'+Number(body.balance).toLocaleString('en-US')+(body.asOf?(' as of '+body.asOf):''),
          [L.user]:who.name||'', [L.email]:who.email||'' } }]);
      }catch(logErr){ /* best effort */ }
      return reply(200, { ok:true, balance:Number(body.balance), asOf:body.asOf||'', user:who });
    }

    if(body.op === 'plan_get'){
      if(!body.countryId) return reply(400, { error:'Missing countryId.' });
      if(isScopedCountry(who) && !(who.countryIds||[]).includes(body.countryId)) return reply(403, { error:'You can only view your own country\'s plan.' });
      const rec = await at(BASE+'/'+T_COUNTRIES+'/'+body.countryId+'?returnFieldsByFieldId=true');
      return reply(200, { plan:(rec.fields && rec.fields[CTRY_PLAN_F])||'', updated:(rec.fields && rec.fields[CTRY_PLAN_UPD_F])||'',
        name:(rec.fields && rec.fields[CTRY_NAME_F])||'', user:who });
    }

    if(body.op === 'plan_save'){
      // Amanda/oversight and coaches can save any country's plan; a country
      // leader can save their own.
      if(!body.countryId) return reply(400, { error:'Missing countryId.' });
      const isCoachRole = (who.role||'').trim() === 'National Ministries Coaches';
      const own = (who.countryIds||[]).includes(body.countryId);
      const allowed = isOversight(who) || isCoachRole || own || ADMINS.includes((who.email||'').trim().toLowerCase());
      if(!allowed) return reply(403, { error:'Not permitted.' });
      if(isScopedCountry(who) && !own) return reply(403, { error:'You can only update your own country\'s plan.' });
      await at(BASE+'/'+T_COUNTRIES+'/'+body.countryId, { method:'PATCH', body:JSON.stringify({ fields:{
        [CTRY_PLAN_F]: String(body.text||''), [CTRY_PLAN_UPD_F]: new Date().toISOString().slice(0,10) }, typecast:true }) });
      try{ await writeLog([{ fields:{ [L.entry]:'Strategic plan updated', [L.type]:'Status change',
        [L.detail]:(who.name||who.email)+' saved a country strategic plan', [L.user]:who.name||'', [L.email]:who.email||'' } }]); }catch(e){}
      return reply(200, { ok:true, user:who });
    }

    if(body.op === 'plan_extract'){
      // Turn an uploaded PDF into plain text for the strategic-plan editor.
      // Claude reads the document directly, so scanned PDFs work too.
      if(!ANTHROPIC_KEY) return reply(200, { needsKey:true, user:who });
      const file = body.file || {};
      if(!file.data) return reply(400, { error:'Missing file.' });
      if(String(file.data).length > 5500000) return reply(400, { error:'That file is too large — keep it under ~4 MB.' });
      const r2 = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'x-api-key':ANTHROPIC_KEY, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
        body: JSON.stringify({ model:'claude-opus-5', max_tokens:8000, output_config:{ effort:'low' },
          messages:[{ role:'user', content:[
            { type:'document', source:{ type:'base64', media_type:'application/pdf', data:file.data } },
            { type:'text', text:'Transcribe the complete text content of this document as clean plain text. Keep headings and list items on their own lines. Do not summarize, do not add commentary — output only the transcription.' }
          ]}] }),
      });
      const d2 = await r2.json().catch(() => ({}));
      if(!r2.ok) return reply(500, { error:(d2.error && d2.error.message) || 'Could not read that PDF.' });
      const text = (d2.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if(!text) return reply(400, { error:'No text could be read from that PDF.' });
      return reply(200, { text, user:who });
    }

    if(body.op === 'fit_check'){
      if(!body.recordId) return reply(400, { error:'Missing recordId.' });
      if(!ANTHROPIC_KEY) return reply(200, { needsKey:true, user:who });
      const fit = await runFitCheck(body.recordId);
      if(!fit) return reply(400, { error:'No strategic plan is on file for this project\'s country yet — add it under Management → Strategic plans.' });
      return reply(200, { fit, user:who });
    }

    if(body.op === 'cycle_create'){
      // Add a foundation gift: a new foundation's first cycle, or another
      // gift/cycle from a foundation that has given before (Grant Team page).
      if(!isOversight(who) && !ADMINS.includes((who.email||'').trim().toLowerCase()))
        return reply(403, { error:'Only the grant department can add foundation gifts.' });
      const f = body.fields || {};
      if(!f.foundation || !String(f.foundation).trim()) return reply(400, { error:'Missing foundation name.' });
      if(!f.name || !String(f.name).trim()) return reply(400, { error:'Missing cycle name.' });
      const fields = { [CYF.name]:String(f.name).trim(), [CYF.foundation]:String(f.foundation).trim() };
      if(f.total != null && f.total !== '') fields[CYF.total] = Number(f.total) || 0;
      const created = await at(BASE+'/'+T_CYCLE, { method:'POST', body:JSON.stringify({ records:[{fields}], typecast:true }) });
      const rec = created.records && created.records[0];
      try{
        await writeLog([{ fields:{ [L.entry]:'Foundation gift added — '+String(f.foundation).trim()+' '+String(f.name).trim(),
          [L.type]:'Funding assignment',
          [L.detail]:(who.name||who.email)+' added a gift of $'+(Number(f.total)||0).toLocaleString('en-US')+' from '+String(f.foundation).trim()+' (cycle '+String(f.name).trim()+')',
          [L.user]:who.name||'', [L.email]:who.email||'' } }]);
      }catch(logErr){ /* best effort */ }
      return reply(200, { ok:true, id: rec && rec.id, user:who });
    }

    if(body.op === 'delete'){
      if(!canDelete(who)) return reply(403, { error:'You do not have permission to delete a project.' });
      if(!body.recordId) return reply(400, { error:'Missing recordId.' });
      await at(BASE+'/'+T_PROP+'/'+body.recordId, { method:'DELETE' });
      try{
        await writeLog([{ fields:{
          [L.entry]:(body.projectName ? body.projectName+' — ' : '') + 'Project deleted',
          [L.type]:'Delete',
          [L.detail]:'Project permanently deleted from the grant pipeline',
          [L.user]:who.name, [L.email]:who.email, [L.pid]:body.recordId
        }}]);
      }catch(logErr){ /* logging is best-effort; never block the delete */ }
      return reply(200, { deleted:true, recordId:body.recordId, user:who });
    }

    if(body.op === 'history'){
      let recs = await fetchAll(T_LOG, {});
      if(body.proposalId) recs = recs.filter(r => r.fields[L.pid] === body.proposalId);
      recs.sort((a,b) => new Date(b.createdTime) - new Date(a.createdTime));
      const out = recs.slice(0, body.limit || 150).map(r => ({
        id:r.id, at:r.createdTime, type:v(r.fields[L.type]) || '',
        detail:r.fields[L.detail] || r.fields[L.entry] || '',
        user:r.fields[L.user] || '', email:r.fields[L.email] || '', proposalId:r.fields[L.pid] || ''
      }));
      return reply(200, { records:out });
    }

    if(body.op === 'submit_application'){
      // A country leader applies for a project grant from their own page.
      const f = body.fields || {};
      if(!f.name || !f.requested) return reply(400, { error:'Project name and amount are required.' });
      let countryId = body.countryId || (who.countryIds && who.countryIds[0]) || '';
      if(isScopedCountry(who) && countryId && !(who.countryIds||[]).includes(countryId)) countryId = (who.countryIds||[])[0] || '';
      const PA = { name:'fld1qi35letQtg6yC', requested:'fld3bvuKr1SIXAwUf', stage:STAGE_F, status:STATUS_F,
        submitted:'fldiAdRWxktreIrDZ', country:'fldaHnvEM4RokRDth', leaderName:'fldcwusDwTyQ5E5Qf', leaderEmail:'fldbs0FzyPWbS1waI',
        subName:'fldlfXrnrE7yAyNul', subEmail:'fld64OxiMWtnko2H7', category:'fldqZcI9IgfOPCdt3', requestType:'fldvmIx5iytXPIgve',
        problem:'fldb0TRzRi1nzkN7v', people:'fld8CdQ8Ens5m3NDs', leaders:'fldc2XplvqvAX8NlX', churches:'fld6ZWqZuuK9gcfab',
        budget:'fldofeeQU3DlrHULR', objective:'fld17fOaX3yAe3s4O', objective2:'fld2tSgq12UOBDMri', objective3:'fldquJXeXakScgMnU',
        success:'fldQKLTpf2M69gneF', sustain:'fldvktGeT6orNqBlA', fit:'fldTa8BUePK8Ifs02',
        team:'fldBqgoZhWMtEjsq0', lead:'flddNefZxzHMlvr9t', start:'fldVIJKaXqmUw8qFP', end:'fldxV1o8EVEXaitod',
        otherFunding:'fldRu1psJOpQPSx5W', received:'fld95zxnULYIKO8nf', unused:'fld5TuhikpzrgI6G2', checklist:'fldYJSfdlEI8cBTOm',
        acct:'fldrqg7gy2oEhfdvw' };
      const fields = {
        [PA.name]:String(f.name).trim(), [PA.requested]:Number(f.requested)||0,
        [PA.stage]:'Submitted', [PA.status]:'Submitted ', [PA.submitted]:true,
        [PA.leaderName]:who.name||'', [PA.leaderEmail]:who.email||'', [PA.subName]:who.name||'', [PA.subEmail]:who.email||''
      };
      if(countryId) fields[PA.country] = [countryId];
      const setN = (k,v)=>{ if(v!=null&&v!=='') fields[k]=Number(v)||0; };
      const setS = (k,v)=>{ if(v!=null&&String(v).trim()!=='') fields[k]=String(v).trim(); };
      setS(PA.category,f.category); setS(PA.requestType,f.requestType); setS(PA.problem,f.problem);
      setN(PA.people,f.people); setN(PA.leaders,f.leaders); setN(PA.churches,f.churches); setN(PA.budget,f.totalBudget);
      setS(PA.objective,f.objective); setS(PA.objective2,f.objective2); setS(PA.objective3,f.objective3);
      setS(PA.success,f.success); setS(PA.sustain,f.sustainability); setS(PA.fit,f.strategicFit);
      setS(PA.team,f.team); setS(PA.lead,f.projectLead); setS(PA.otherFunding,f.otherFunding);
      setS(PA.received,f.receivedFunds); setS(PA.unused,f.unusedFunds); setS(PA.acct,f.cedarstoneAccount);
      if(f.start) fields[PA.start]=f.start; if(f.end) fields[PA.end]=f.end;
      if(Array.isArray(f.checklist) && f.checklist.length) fields[PA.checklist]=f.checklist;
      const created = await at(BASE+'/'+T_PROP, { method:'POST', body:JSON.stringify({ records:[{fields}], typecast:true }) });
      const recId = created.records && created.records[0] && created.records[0].id;
      // Optional budget-breakdown file → upload straight to the attachment field.
      if(recId && body.budgetFile && body.budgetFile.data){
        try{
          await fetch('https://content.airtable.com/v0/'+BASE+'/'+recId+'/fld3cTDxR62CssdGY/uploadAttachment', {
            method:'POST', headers:{ Authorization:'Bearer '+TOKEN, 'Content-Type':'application/json' },
            body: JSON.stringify({ contentType: body.budgetFile.contentType||'application/octet-stream',
              file: body.budgetFile.data, filename: body.budgetFile.filename||'budget' })
          });
        }catch(upErr){ /* attachment is best-effort; never block the application */ }
      }
      try{ await writeLog([{ fields:{ [L.entry]:String(f.name).trim()+' — application submitted', [L.type]:'Status change',
        [L.detail]:(who.name||who.email)+' submitted a new grant application', [L.user]:who.name||'', [L.email]:who.email||'', [L.pid]:recId||'' } }]); }catch(e){}
      // Auto-run the strategic fit check so it's already waiting on the coach's
      // and council's cards. Best-effort — never blocks the submission.
      try{ if(recId) await runFitCheck(recId); }catch(fitErr){ /* re-runnable from the app */ }
      return reply(200, { ok:true, id:recId, user:who });
    }

    if(body.op === 'cycle_report'){
      if(!isOversight(who)) return reply(403, { error:'Not permitted.' });
      if(!body.cycleId) return reply(400, { error:'Missing cycleId.' });
      const data = await gatherCycle(body.cycleId);
      return reply(200, { ...data, user:who });
    }

    if(body.op === 'cycle_summary'){
      if(!isOversight(who)) return reply(403, { error:'Not permitted.' });
      if(!ANTHROPIC_KEY) return reply(200, { needsKey:true, user:who });
      // Reuse the report data the front-end already fetched when present; only
      // re-gather from Airtable if it wasn't passed.
      const data = (body.data && body.data.stories) ? body.data : await gatherCycle(body.cycleId);
      const summary = await writeImpactSummary(data);
      return reply(200, { summary, generated:true, user:who });
    }

    return reply(400, { error:'Unknown op.' });
  }catch(e){
    return reply(500, { error:e.message });
  }
};
