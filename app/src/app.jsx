import { useEffect, useState } from 'preact/hooks';
import { api, getToken, setExpireHandler } from './shared/api.js';
import { signOut } from './shared/auth.js';
import { ROLE_BY_AIRTABLE } from './shared/schema.js';
import { SignIn } from './views/SignIn.jsx';
import { GrantTeam } from './views/GrantTeam.jsx';
import { Council } from './views/Council.jsx';
import { Foundations } from './views/Foundations.jsx';
import { Reports } from './views/Reports.jsx';
import { Coach } from './views/Coach.jsx';
import { Country } from './views/Country.jsx';
import { Management } from './views/Management.jsx';

// The workspace tabs and which roles can open each. A role with no match falls
// back to seeing everything (useful before roles are fully populated).
const TABS = [
  { key: 'country',     label: 'My Country',   roles: ['country', 'evp', 'president'] },
  { key: 'coach',       label: 'Coach Review', roles: ['coach', 'evp', 'president'] },
  { key: 'council',     label: 'Council',     roles: ['evp', 'president'] },
  { key: 'grant',       label: 'Grant Team',  roles: ['evp', 'president', 'grant', 'cfo'] },
  { key: 'foundations', label: 'Foundations', roles: ['evp', 'president', 'grant', 'cfo'] },
  { key: 'reports',     label: 'Reports',     roles: ['evp', 'president', 'grant', 'cfo'] },
  { key: 'manage',      label: 'Management',  roles: ['evp', 'president'] },
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

export function Workspace({ boot, session, onRefresh }) {
  const roleKey = session.role && session.role.key;
  const tabs = TABS.filter(t => !roleKey || t.roles.includes(roleKey));
  const available = tabs.length ? tabs : TABS;   // no role match → show all for now
  const HOME = { country: 'country', coach: 'coach', evp: 'council', president: 'council', grant: 'grant', cfo: 'grant' };
  const home = available.some(t => t.key === HOME[roleKey]) ? HOME[roleKey] : available[0].key;
  const [tab, setTab] = useState(home);

  return (
    <div class="shell wide">
      <div class="topbar">
        <div class="brand">
          <div class="mk">JV</div>
          <div><h1>National Ministries</h1><div class="sub">Grant lifecycle · v2</div></div>
        </div>
        <div class="topbar-right">
          <span class="who">{session.user.name || session.user.email}{session.role ? ` · ${session.role.label}` : ''}</span>
          <button class="ghostbtn" onClick={onRefresh}>↻ Refresh</button>
          <button class="ghostbtn" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {available.length > 1 && (
        <nav class="tabs">
          {available.map(t => (
            <button class={`tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>
      )}

      {tab === 'country' && <Country boot={boot} session={session} onRefresh={onRefresh} />}
      {tab === 'coach' && <Coach boot={boot} session={session} onRefresh={onRefresh} />}
      {tab === 'council' && <Council boot={boot} onRefresh={onRefresh} />}
      {tab === 'grant' && <GrantTeam boot={boot} session={session} onRefresh={onRefresh} />}
      {tab === 'foundations' && <Foundations boot={boot} />}
      {tab === 'reports' && <Reports boot={boot} />}
      {tab === 'manage' && <Management boot={boot} onRefresh={onRefresh} />}
    </div>
  );
}
