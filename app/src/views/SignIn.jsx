import { useState } from 'preact/hooks';
import { signIn } from '../shared/auth.js';

export function SignIn({ initialError, onSignedIn }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState(initialError || '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email || !pass) { setErr('Enter your email and password.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await signIn(email, pass);
      onSignedIn(res);
    } catch (e) {
      setErr(e.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="gate">
      <div class="box">
        <div class="mk stacked"><span>NAT</span><span>MIN</span></div>
        <h1>National Ministries</h1>
        <div class="sub">Sign in to your grant dashboard.</div>
        <input
          type="email" placeholder="Email" autocomplete="username" value={email}
          onInput={e => setEmail(e.currentTarget.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} />
        <input
          type="password" placeholder="Password" autocomplete="current-password" value={pass}
          onInput={e => setPass(e.currentTarget.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} />
        <button disabled={busy} onClick={submit}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div class="err">{err}</div>
        <div class="hint">First time? Enter the email your administrator added and choose a password — it'll be set for you.</div>
      </div>
    </div>
  );
}
