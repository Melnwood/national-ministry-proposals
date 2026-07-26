// Sign-in / sign-out. The heavy lifting (password hashing, token signing, role
// lookup) lives in the Netlify function; this just moves the token around.

import { api, setToken } from './api.js';

export async function signIn(email, password) {
  const d = await api('login', { email: (email || '').trim(), password });
  setToken(d.token);
  return d; // { token, user, firstTime }
}

export function signOut() {
  setToken(null);
  location.reload();
}
