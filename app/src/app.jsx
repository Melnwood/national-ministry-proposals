import { useEffect, useState } from 'preact/hooks';
import { api, getToken, setExpireHandler } from './shared/api.js';
import { signOut } from './shared/auth.js';
import { ROLE_BY_AIRTABLE, ROLES } from './shared/schema.js';
import { SignIn } from './views/SignIn.jsx';
import { GrantTeam } from './views/GrantTeam.jsx';
import { Council } from './views/Council.jsx';
import { Foundations } from './views/Foundations.jsx';
import { Reports } from './views/Reports.jsx';
import { Coach } from './views/Coach.jsx';
import { Country } from './views/Country.jsx';
import { Management } from './views/Management.jsx';
import { CountryHistory } from './views/CountryHistory.jsx';
import { Accounting } from './views/Accounting.jsx';
import { NotificationBell } from './views/NotificationBell.jsx';

// The workspace tabs and which roles can open each. A role with no match falls
// back to seeing everything (useful before roles are fully populated).
// CFO and President are grant-department users — they live in the Grant Team
// view and its sibling tabs. The council decision + management tabs are EVP-only
// (Ben & Amanda). Grant/Accounting/Foundations/Reports = the grant department.
const TABS = [
  { key: 'country',     label: 'My Country',   roles: ['country', 'evp'] },
  { key: 'coach',       label: 'Coach Review', roles: ['coach', 'evp'] },
  { key: 'council',     label: 'Council Lead Team', roles: ['evp'] },
  { key: 'grant',       label: 'Grant Team',  roles: ['evp', 'president', 'grant', 'cfo'] },
  { key: 'accounting',  label: 'Accounting',  roles: ['evp', 'president', 'grant', 'cfo'] },
  { key: 'foundations', label: 'Foundations', roles: ['evp', 'president', 'grant', 'cfo'] },
  { key: 'reports',     label: 'Reports',     roles: ['evp', 'president', 'grant', 'cfo'] },
  { key: 'history',     label: 'Country History', roles: ['evp', 'president', 'grant', 'cfo'] },
  { key: 'manage',      label: 'Management',  roles: ['evp'] },
];

export function App() {
  const [status, setStatus] = useState(getToken() ? 'loading' : 'signedout');
  const [gateErr, setGateErr] = useState('');
  const [boot, setBoot] = useState(null);
  const [session, setSession] = useState(null); // { user, role }

  useEffect(() => {
    setExpireHandler(msg => { setGateErr(msg); setSession(null); setBoot(null); setStatus('signedout'); });
  }, []);

  async function loadSession() {
    setStatus('loading');
    try {
      const data = await api('bootstrap', {});
      const roleName = data.user && data.user.role;
      const role = roleName ? ROLE_BY_AIRTABLE[roleName] : null;
      setBoot(data);
      setSession({ user: data.user || {}, role });
      setStatus('signedin');
    } catch (e) {
      if (e.message !== 'Session expired') { setGateErr(e.message || 'Could not load your dashboard.'); setStatus('signedout'); }
    }
  }

  useEffect(() => { if (getToken()) loadSession(); }, []);

  if (status === 'signedout') return <SignIn initialError={gateErr} onSignedIn={() => loadSession()} />;
  if (status === 'loading' || !boot) {
    return <div class="gate"><div class="box"><div class="mk">JV</div><div class="sub">Loading your dashboard…</div></div></div>;
  }

  return <Workspace boot={boot} session={session} onRefresh={loadSession} />;
}

const HOME = { country: 'country', coach: 'coach', evp: 'council', president: 'grant', grant: 'grant', cfo: 'grant' };
// Roles a leadership user can preview the app as.
const VIEW_AS = [
  { key: 'country', label: 'Country leader' },
  { key: 'coach', label: 'Regional coach' },
  { key: 'evp', label: 'EVP / Council (Ben & Amanda)' },
  { key: 'grant', label: 'Grant team' },
  { key: 'cfo', label: 'CFO' },
  { key: 'president', label: 'President' },
];

export function Workspace({ boot, session, onRefresh }) {
  const realRole = session.role && session.role.key;
  // Full-oversight preview ("View as") stays with EVP / council (Ben & Amanda).
  const canPreview = realRole === 'evp';
  const [viewRole, setViewRole] = useState(realRole);
  const roleKey = canPreview ? viewRole : realRole;

  const tabs = TABS.filter(t => !roleKey || t.roles.includes(roleKey));
  const available = tabs.length ? tabs : TABS;
  const home = available.some(t => t.key === HOME[roleKey]) ? HOME[roleKey] : available[0].key;
  const [tab, setTab] = useState(home);
  // When previewing a different role, jump to that role's home tab.
  useEffect(() => { setTab(home); }, [viewRole]);

  // The session handed to the views reflects the previewed role (keeps the real
  // identity + full oversight data, so the previewed screens still populate).
  const viewSession = (canPreview && viewRole !== realRole)
    ? { ...session, role: (ROLES[viewRole] || session.role), previewing: true }
    : session;

  return (
    <div class="shell wide">
      <div class="topbar">
        <div class="brand">
          <div class="mk">JV</div>
          <div><h1>National Ministries</h1><div class="sub">Grant lifecycle · v2</div></div>
        </div>
        <div class="topbar-right">
          {canPreview && (
            <label class="viewas">
              <span>View as</span>
              <select value={viewRole} onChange={e => setViewRole(e.currentTarget.value)}>
                {VIEW_AS.map(r => <option value={r.key}>{r.label}</option>)}
              </select>
            </label>
          )}
          <span class="who">{session.user.name || session.user.email}</span>
          <NotificationBell />
          <button class="ghostbtn" onClick={onRefresh}>↻ Refresh</button>
          <button class="ghostbtn" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {canPreview && viewRole !== realRole && (
        <div class="previewbar">Previewing as <b>{(ROLES[viewRole] || {}).label || viewRole}</b> — this is what they see. <button onClick={() => setViewRole(realRole)}>Back to my view</button></div>
      )}

      {available.length > 1 && (
        <nav class="tabs">
          {available.map(t => (
            <button class={`tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>
      )}

      {tab === 'country' && <Country boot={boot} session={viewSession} onRefresh={onRefresh} />}
      {tab === 'coach' && <Coach boot={boot} session={viewSession} onRefresh={onRefresh} />}
      {tab === 'council' && <Council boot={boot} onRefresh={onRefresh} />}
      {tab === 'grant' && <GrantTeam boot={boot} session={viewSession} onRefresh={onRefresh} />}
      {tab === 'accounting' && <Accounting boot={boot} session={viewSession} onRefresh={onRefresh} />}
      {tab === 'foundations' && <Foundations boot={boot} />}
      {tab === 'reports' && <Reports boot={boot} />}
      {tab === 'history' && <CountryHistory boot={boot} />}
      {tab === 'manage' && <Management boot={boot} onRefresh={onRefresh} />}
    </div>
  );
}
