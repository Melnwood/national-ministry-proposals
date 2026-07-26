// The one API client for the whole app. Every call goes through the Netlify
// function with a {op, ...payload} envelope and a Bearer session token.

const ENDPOINT = '/.netlify/functions/airtable';
const TOKEN_KEY = 'jv_token';

let onExpire = () => {}; // set by the app so a 401 can bounce to the sign-in gate

export const setExpireHandler = fn => { onExpire = fn; };
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = t => { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); };

export async function api(op, payload) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
    headers,
    body: JSON.stringify({ op, ...(payload || {}) }),
  });

  let data;
  try { data = await res.json(); } catch { data = { error: 'Bad response from server.' }; }

  if (res.status === 401 && op !== 'login') {
    setToken(null);
    onExpire('Session expired — please sign in again.');
    throw new Error('Session expired');
  }
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}
