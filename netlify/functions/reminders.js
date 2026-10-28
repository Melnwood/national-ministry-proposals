// Weekly money reminder — runs every Monday morning (schedule in netlify.toml).
// Looks for money sitting in the pipeline and sends Amanda ONE digest:
//   · SECC travel grants approved but not yet paid
//   · project grants parked at Accounting / Funds Transferred
// and flags anything that CAN'T be paid yet because the Cedarstone account
// number is missing. Sends nothing when nothing is waiting.
//
// Delivery: a Notifications record of type "Transfer" — the existing Airtable
// automation ("Email on Funds Transferred or Denied only") emails it, and it
// shows in the app's notification bell either way.

const BASE   = 'appLRSKHHakcaW0X9';
const AT     = 'https://api.airtable.com/v0/';
const TOKEN  = process.env.AIRTABLE_TOKEN;
const SITE_URL = 'https://national-ministry-proposals.netlify.app';

// Who gets the digest: Amanda (EVP — the only one who sends money from the
// tool). Change here if that ever moves.
const REMIND_TO   = 'asnyder@josiahventure.com';
const REMIND_NAME = 'Amanda';

const T_TRAVEL = 'tbl89ML7snRz5BQqL';
const TR = { name:'fldbCntiM2HMr1RB8', reqAmt:'fldRwm5T4wcLIeIuL', appAmt:'fldGoVMNTpc2jf0v5',
             status:'fldtcWGoQLVOQcG5P', acct:'fld79txN2YZDxffqu' };
const T_PROP = 'tblloFNzGSdio6zWS';
const PF = { name:'fld1qi35letQtg6yC', stage:'fld3Sh8TGO0Nukrgc', awarded:'fldeeQMQPRVyXbklW',
             country:'fldpZ00pUwm1gB4zN', acct:'fldrqg7gy2oEhfdvw' };
const T_NOTIF = 'tblEpClYAomtd5t2l';
const N = { msg:'fldrTRN1vLi2HC3Db', email:'fld6amQya62dBl92t', type:'fldYI8zxRVWHXuue0',
            link:'fldkcJpvziAQoRSWz', name:'fldykHqa2JyKlkykm' };

async function at(path, opts={}){
  const r = await fetch(AT + path, { ...opts, headers:{ Authorization:'Bearer '+TOKEN, 'Content-Type':'application/json', ...(opts.headers||{}) } });
  const t = await r.text(); let d; try{ d = JSON.parse(t); }catch(e){ d = { raw:t }; }
  if(!r.ok) throw new Error((d.error && (d.error.message||d.error.type)) || ('Airtable HTTP '+r.status));
  return d;
}
async function fetchAll(table, params){
  let recs=[], offset;
  do{
    const q = new URLSearchParams(params||{}); q.set('returnFieldsByFieldId','true'); q.set('pageSize','100');
    if(offset) q.set('offset', offset);
    const d = await at(BASE+'/'+table+'?'+q.toString());
    recs = recs.concat(d.records); offset = d.offset;
  } while(offset);
  return recs;
}

const sname = x => ((x && (x.name || x)) || '').trim();
const usd = n => '$'+Math.round(Number(n)||0).toLocaleString('en-US');
const daysSince = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

exports.handler = async function(){
  if(!TOKEN) return { statusCode: 200, body: 'no token' };
  try{
    const [travelRecs, propRecs] = await Promise.all([
      fetchAll(T_TRAVEL, {}),
      fetchAll(T_PROP, {})
    ]);

    // SECC travel: approved, not yet paid.
    const waitingTravel = travelRecs
      .filter(r => sname(r.fields[TR.status]) === 'Approved')
      .map(r => ({
        name: r.fields[TR.name] || 'Someone',
        amt: r.fields[TR.appAmt] || r.fields[TR.reqAmt] || 0,
        acct: String(r.fields[TR.acct] || '').trim(),
        days: daysSince(r.createdTime)
      }));

    // Project grants sitting at Accounting (or transfer requested, unconfirmed).
    const WAIT_STAGES = ['At Accounting', 'Funds Transferred'];
    const waitingGrants = propRecs
      .filter(r => WAIT_STAGES.includes(sname(r.fields[PF.stage])))
      .map(r => ({
        name: r.fields[PF.name] || 'A grant',
        country: r.fields[PF.country] || '',
        amt: r.fields[PF.awarded] || 0,
        acct: String(r.fields[PF.acct] || '').trim()
      }));

    if(!waitingTravel.length && !waitingGrants.length) return { statusCode: 200, body: 'nothing waiting' };

    const flag = it => it.acct ? '' : ' — MISSING the Cedarstone account number, so it can’t be paid yet';
    const lines = [];
    if(waitingTravel.length){
      lines.push(`${waitingTravel.length} SECC travel ${waitingTravel.length === 1 ? 'grant is' : 'grants are'} approved and waiting to be paid: `
        + waitingTravel.map(t => `${t.name} ${usd(t.amt)} (waiting ${t.days} days${flag(t)})`).join('; ') + '.');
    }
    if(waitingGrants.length){
      lines.push(`${waitingGrants.length} project ${waitingGrants.length === 1 ? 'grant is' : 'grants are'} sitting at Accounting: `
        + waitingGrants.map(g => `${g.name}${g.country ? ` (${g.country})` : ''} ${usd(g.amt)}${flag(g)}`).join('; ') + '.');
    }
    const msg = 'Weekly reminder — money is waiting on you. ' + lines.join(' ')
      + ' Open the Accounting tab to pick the ready ones and send accounting one email. Missing account numbers can be typed right on each row.';

    await at(BASE+'/'+T_NOTIF, { method:'POST', body:JSON.stringify({ records:[{ fields:{
      [N.email]: REMIND_TO, [N.name]: REMIND_NAME, [N.msg]: msg, [N.type]: 'Transfer', [N.link]: SITE_URL
    }}], typecast:true }) });
    return { statusCode: 200, body: `reminded: ${waitingTravel.length} travel, ${waitingGrants.length} grants` };
  }catch(e){
    return { statusCode: 500, body: String(e && e.message || e) };
  }
};
