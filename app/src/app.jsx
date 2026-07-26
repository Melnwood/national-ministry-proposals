import { useEffect, useState } from 'preact/hooks';
import { api, getToken, setExpireHandler } from './shared/api.js';
import { signOut } from './shared/auth.js';
import { ROLE_BY_AIRTABLE } from './shared/schema.js';
import { SignIn } from './views/SignIn.jsx';

// Phase 0 shell. It proves the whole spine end-to-end: sign in → the backend
// returns who you are → we resolve your role. The four role views (grant team,
// EVP/council, coach, country) get slotted into `RoleView` in the next phases.
export function App() {
  const [status, setStatus] = useState(getToken() ? 'loading' : 'signedout');
  const [gateErr, setGateErr] = useState('');
  const [session, setSession] = useState(null); // { user, role }

  useEffect(() => {
    setExpireHandler(msg => { setGateErr(msg); setSession(null); setStatus('signedout'); });
  }, []);

  async function loadSession() {
    setStatus('loading');
    try {
      // `bootstrap` returns the signed-in user. Role resolution is Phase 0
      // backend work; until the function returns it, `role` may be undefined
      // and we show the neutral shell.
      const boot = await api('bootstrap', {});
      const roleName = boot.user && boot.user.role;
      const role = roleName ? ROLE_BY_AIRTABLE[roleName] : null;
      setSession({ user: boot.user || {}, role });
      setStatus('signedin');
    } catch (e) {
      if (e.message !== 'Session expired') { setGateErr(e.message || 'Could not load your dashboard.'); setStatus('signedout'); }
    }
  }

  useEffect(() => { if (getToken()) loadSession(); }, []);

  if (status === 'signedout') {
    return <SignIn initialError={gateErr} onSignedIn={() => loadSession()} />;
  }
  if (status === 'loading') {
    return <div class="gate"><div class="box"><div class="mk">JV</div><div class="sub">Loading your dashboard…</div></div></div>;
  }
  return <RoleView session={session} />;
}

// Temporary landing shell — confirms sign-in and role resolution work. Replaced
// per-role in Phases 1–4.
function RoleView({ session }) {
  const { user, role } = session;
  return (
    <div class="shell">
      <div class="topbar">
        <div class="brand">
          <div class="mk">JV</div>
          <div><h1>National Ministries</h1><div class="sub">Grant lifecycle · v2</div></div>
        </div>
        <button class="ghostbtn" onClick={signOut}>Sign out</button>
      </div>
      <div class="panel">
        <p style="font-size:15px;">Signed in as <b>{user.name || user.email || 'unknown'}</b>{' '}
          {role ? <span class="rolechip">{role.label}</span>
                : <span class="rolechip" style="background:#eee;color:#777;">role not set</span>}
        </p>
        <p style="font-size:13.5px;color:var(--ink-soft);margin-top:12px;line-height:1.6;">
          Foundation is live — shared schema, one API client, role-aware sign-in.
          Your role window (grant team / council / coach / country) gets built onto this shell next.
        </p>
      </div>
    </div>
  );
}
