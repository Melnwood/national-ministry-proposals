import { useState, useEffect, useMemo } from 'preact/hooks';
import { api } from '../shared/api.js';
import { date } from '../shared/format.js';
import { stageKey, coach as coachName } from '../shared/grants.js';
import { reportKind } from '../shared/reports.js';

// A leader's own "your grant has been funded" message gets the big
// celebration banner; everyone else's copies stay ordinary cards.
const isFundedHero = n => (n.message || '').startsWith('Your grant') && (n.message || '').includes('has been funded');

// The first thing anyone sees after signing in: their unread messages, each
// explained in plain words (what happened + what to expect next), and their
// role's to-dos with a jump straight to the right tab. The bell keeps the
// full history; this panel only shows what's new or needs action, and each
// card disappears once its "Got it" is clicked.

// Tailor the "what happens next" line to what the message is about.
function nextStep(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('not approved'))
    return { tone: 'deny', text: 'What happens next: the Council Lead Team\'s reason is above. Talk it through with your coach — you can strengthen the application and re-apply in a future cycle.' };
  if (m.includes('deferred'))
    return { tone: 'defer', text: 'What happens next: your project IS approved — it\'s waiting in line for funding. Confirm on My Country that you still want it, and you\'ll hear the moment funds free up.' };
  if (m.includes('has been funded') || m.includes('funds sent') || m.includes('on its way'))
    return { tone: 'funded', text: 'What happens next: the money lands in the Cedarstone account within a few business days. As the project runs, a mid-project and a final report will come due — they\'ll appear on your page.' };
  if (m.includes('was approved') || m.includes('good news'))
    return { tone: 'funded', text: 'What happens next: your grant heads to accounting for the transfer. You\'ll get another message here the moment the money is sent.' };
  if (m.includes('ready to decide') || m.includes('submitted their review'))
    return { tone: 'action', text: 'What happens next: open the Council Lead Team tab and make the call — approve, defer, or deny with a reason.' };
  if (m.includes('still needed') || m.includes('still waiting on funding'))
    return { tone: 'action', text: 'What happens next: check with the country whether the money is still needed, and update the grant.' };
  if (m.includes('cleared to transfer') || m.includes('ready to send'))
    return { tone: 'action', text: 'What happens next: open Accounting — the account number and amount are on the card, one click records the transfer.' };
  return { tone: 'info', text: '' };
}

export function Welcome({ boot, session, onGo }) {
  const [notifs, setNotifs] = useState([]);
  useEffect(() => {
    api('notifications', {}).then(d => setNotifs((d.notifications || []).filter(n => !n.read))).catch(() => {});
  }, []);

  async function gotIt(id) {
    setNotifs(list => list.filter(n => n.id !== id));
    try {
      await api('notif_read', { ids: [id] });
      window.dispatchEvent(new CustomEvent('jv-notifs-changed'));
    } catch (e) { /* silent */ }
  }

  // Role to-dos, computed from the same data the tabs use.
  const todos = useMemo(() => {
    const props = boot.props || [];
    const role = session.role && session.role.key;
    const me = (session.user && (session.user.name || '')).trim().toLowerCase();
    const at = k => props.filter(p => stageKey(p) === k).length;
    const list = [];
    if (role === 'coach') {
      const mine = props.filter(p => {
        const c = coachName(p).trim().toLowerCase();
        return (['submitted', 'coach'].includes(stageKey(p))) && (c.includes(me) || me.includes(c));
      }).length;
      if (mine) list.push({ n: mine, text: `grant${mine === 1 ? '' : 's'} waiting for your review`, tab: 'coach', btn: 'Review now' });
    }
    if (role === 'evp') {
      const q = props.filter(p => ['submitted', 'coach'].includes(stageKey(p))).length;
      if (q) list.push({ n: q, text: 'awaiting a Council Lead Team decision', tab: 'council', btn: 'Decide' });
      const acc = at('accounting');
      if (acc) list.push({ n: acc, text: 'ready to transfer at accounting', tab: 'accounting', btn: 'Open Accounting' });
    }
    if (['grant', 'cfo', 'president'].includes(role)) {
      const acc = at('accounting');
      if (acc) list.push({ n: acc, text: 'ready to transfer at accounting', tab: 'accounting', btn: 'Open Accounting' });
      const def = at('deferred');
      if (def) list.push({ n: def, text: 'approved and waiting on funding', tab: 'grant', btn: 'See deferred' });
    }
    return list;
  }, [boot.props, session]);

  if (!notifs.length && !todos.length) return null;

  const first = (session.user && (session.user.name || session.user.email) || '').split(/[@\s]/)[0];
  const heroes = notifs.filter(isFundedHero);
  const rest = notifs.filter(n => !isFundedHero(n));

  return (
    <div class="welcome">
      <div class="w-head">{first ? `${first}, here's what's new for you` : "Here's what's new for you"}</div>
      {heroes.map(n => <FundedBanner key={n.id} n={n} boot={boot} onGotIt={() => gotIt(n.id)} />)}
      {todos.map(t => (
        <div class="w-card action">
          <div class="w-msg"><b>{t.n}</b> {t.text}</div>
          <button class="w-go" onClick={() => onGo(t.tab)}>{t.btn} →</button>
        </div>
      ))}
      {rest.map(n => {
        const step = nextStep(n.message);
        return (
          <div class={`w-card ${step.tone}`} key={n.id}>
            <div>
              <div class="w-msg">{n.message}</div>
              {step.text && <div class="w-next">{step.text}</div>}
            </div>
            <button class="w-go ghost" onClick={() => gotIt(n.id)}>Got it ✓</button>
          </div>
        );
      })}
    </div>
  );
}

// The big moment: a country's project got funded. Front and center — what
// happened, what to expect, and the REAL report due dates for this project
// (from the report records Airtable creates when a grant is funded).
function FundedBanner({ n, boot, onGotIt }) {
  const dueReports = (boot.reports || [])
    .filter(r => r.proposalId === n.propId && !r.done)
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  return (
    <div class="w-banner">
      <div class="w-banner-title">🎉 Congratulations!</div>
      <div class="w-banner-msg">{n.message}</div>
      <div class="w-banner-body">
        <p>The money is on its way to your country's Cedarstone account — allow a few business days for it to arrive.</p>
        <p><b>What we'll need from you:</b> two short reports on how the project is going, so we can celebrate what God is doing and report faithfully to the foundations behind this gift.</p>
        {dueReports.length > 0 ? (
          <ul class="w-banner-due">
            {dueReports.map(r => (
              <li><b>{reportKind(r)}-project report</b>{r.due ? <> — due <b>{date(r.due)}</b></> : ' — due date coming soon'}</li>
            ))}
          </ul>
        ) : (
          <p>Your mid-project and final report due dates will appear here and on your page within a day.</p>
        )}
      </div>
      <button class="w-go" onClick={onGotIt}>Got it — we're celebrating 🎉</button>
    </div>
  );
}
