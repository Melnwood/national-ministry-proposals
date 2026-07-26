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
  'Submitted':'Submitted ', 'Council Decision':'EVP Approval',
  'Approved — Deferred':'Grant is approved but no funding yet',
  'Grant Team Approved':'Grant Team Approval (Dave & Pavel)3',
  'Funding Identified':'Funding For Grant Identified 4',
  'At Accounting':'Funds distributed to Council Account 5',
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
      add(leader, `Your grant "${name}" was not approved. Open your page to read the council's note${decisionMsg?`: “${decisionMsg}”`:'.'}`, 'Decision');
    } else if(opts.kind === 'defer'){
      add(leader, `"${name}" was approved but deferred to a later cycle. Confirm on your page that you still want it.`, 'Decision');
    } else { // approve
      add(leader, `Good news — "${name}" was approved by the council${amt!=='$0'?` for ${amt}`:''}.`, 'Decision');
      council.forEach(e => add(e, `Approved: "${name}"${where} — now with the grant team to fund.`, 'Decision'));
    }
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
        : (opts.kind === 'deny') ? 'An update on your JV grant application'
        : type === 'Decision' ? 'An update on your JV grant'
        : 'JV National Ministries';
      await sendEmail(n.fields[N.email], subject, n.fields[N.msg], n.fields[N.link]);
    }
  }
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
          name: r.fields['fldzgWM7sqaFDM4Cl'] || '',
          phase: (ph && (ph.name || (typeof ph === 'string' ? ph : ''))) || ''
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
        // scoped users get their own grants + reports only; sensitive aggregates withheld
        return reply(200, { cycles, props:mineProps, logs:[], funds:[], bal:null, goals, countries_meta:[], reports:mineReports, travel:[], user:who });
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
        hasPassword: !!(r.fields[A.salt] && r.fields[A.hash])
      })), user:who });
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
        type:v(r.fields[N.type])||'', read:!!r.fields[N.read] }))
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

    return reply(400, { error:'Unknown op.' });
  }catch(e){
    return reply(500, { error:e.message });
  }
};
