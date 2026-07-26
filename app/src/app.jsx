import { useEffect, useState } from 'preact/hooks';
import { api, getToken, setExpireHandler } from './shared/api.js';
import { signOut } from './shared/auth.js';
import { ROLE_BY_AIRTABLE } from './shared/schema.js';
import { SignIn } from './views/SignIn.jsx';
import { GrantTeam } from './views/GrantTeam.jsx';

// Roles that see the grant-team window (Phase 1). Coach + country get their own
// views in later phases.
const GRANT_TEAM_ROLES = new Set(['grant', 'evp', 'cfo', 'president']);

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

  const roleKey = session.role && session.role.key;
  if (GRANT_TEAM_ROLES.has(roleKey) || !roleKey) {
    return <GrantTeam boot={boot} session={session} onRefresh={loadSession} />;
  }
  return <Placeholder session={session} />;
}

// Coach / country roles until their views land (Phases 3–4).
function Placeholder({ session }) {
  const { user, role } = session;
  return (
    <div class="shell">
      <div class="topbar">
        <div class="brand"><div class="mk">JV</div>
          <div><h1>National Ministries</h1><div class="sub">Grant lifecycle · v2</div></div></div>
        <button class="ghostbtn" onClick={signOut}>Sign out</button>
      </div>
      <div class="panel">
        <p style="font-size:15px;">Signed in as <b>{user.name || user.email}</b>{' '}
          <span class="rolechip">{role ? role.label : 'role not set'}</span></p>
        <p style="font-size:13.5px;color:var(--ink-soft);margin-top:12px;">Your {role ? role.label : ''} view is coming in a later phase.</p>
      </div>
    </div>
  );
}
