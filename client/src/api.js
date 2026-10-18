/* Thin fetch wrapper: adds the login token and turns API errors into thrown Error(message). */
const TOKEN = 'noormahal_token';
export const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export const getToken = () => { try { return localStorage.getItem(TOKEN); } catch { return null; } };
export const setToken = t => { try { t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN); } catch { /* storage blocked */ } };

let onUnauthorized = () => {};
export const setUnauthorizedHandler = f => { onUnauthorized = f; };

async function request(method, path, body) {
  const tok = getToken(), headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (tok) headers.Authorization = 'Bearer ' + tok;
  let res;
  try { res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Cannot reach the server. Check your connection.'); }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && path !== '/auth/login') onUnauthorized();
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: p => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  del: p => request('DELETE', p)
};
export const q = s => encodeURIComponent(s);
