/* Production hardening: security headers, client IP behind Cloudflare Tunnel, sign-in rate limiting, start-up checks. */
import os from 'node:os';

export const isProd = () => process.env.NODE_ENV === 'production';
const isLoopback = ip => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

/** Real client IP. Cloudflare Tunnel (cloudflared) runs on this machine and connects from loopback, adding
    CF-Connecting-IP; that header is trusted only from loopback, so office users cannot spoof it. */
export function clientIp(req) {
  /* on Vercel every request arrives from Vercel's proxy, which sets the visitor's address in x-real-ip */
  if (process.env.VERCEL && req.headers['x-real-ip']) return String(req.headers['x-real-ip']);
  const raw = req.socket.remoteAddress || '';
  const cf = req.headers['cf-connecting-ip'];
  return isLoopback(raw) && cf ? String(cf) : raw.replace('::ffff:', '');
}
/** True when the browser reached us over HTTPS through the tunnel. */
const viaHttps = req => isLoopback(req.socket.remoteAddress || '') && req.headers['x-forwarded-proto'] === 'https';

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "media-src 'self' blob:", "connect-src 'self'", "font-src 'self'", "manifest-src 'self'",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"
  ].join('; '));
  if (viaHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
}

/* ---- sign-in rate limiting (in memory; the app runs as one process) ----
   8 failed attempts for the same username from the same IP, or 30 failures from one IP,
   within 15 minutes → that IP must wait. A successful sign-in clears the username's counter. */
const WINDOW = 15 * 60 * 1000, PER_USER = 8, PER_IP = 30;
const fails = new Map(); // key → [timestamps]
const recent = key => { const now = Date.now(), l = (fails.get(key) || []).filter(t => now - t < WINDOW); fails.set(key, l); return l; };
export function loginBlocked(ip, username) {
  const a = recent(ip + '|' + username), b = recent(ip);
  if (a.length < PER_USER && b.length < PER_IP) return 0;
  const first = Math.min(...(a.length >= PER_USER ? a : b));
  return Math.max(1, Math.ceil((first + WINDOW - Date.now()) / 60000)); // minutes to wait
}
export function loginFailed(ip, username) { recent(ip + '|' + username).push(Date.now()); recent(ip).push(Date.now()); }
export function loginOk(ip, username) { fails.delete(ip + '|' + username); }
setInterval(() => { for (const k of fails.keys()) if (!recent(k).length) fails.delete(k); }, WINDOW).unref();

/** The well-known demo password must never stay in use on a live system. */
export const demoPassword = () => process.env.SEED_PASSWORD || 'Noormahal@123';

/** Refuse to start in production with an unsafe configuration. */
export function productionChecks() {
  if (!isProd()) return;
  const problems = [];
  const s = process.env.JWT_SECRET || '';
  if (s.length < 32 || /change-me/i.test(s)) problems.push('JWT_SECRET must be a long random string (32+ characters).');
  if (process.env.SEED_ON_EMPTY !== 'false') problems.push('Set SEED_ON_EMPTY=false so sample data is never loaded into the live database.');
  if (problems.length) { console.error('Refusing to start in production:\n - ' + problems.join('\n - ')); process.exit(1); }
}

/** Addresses office users can open, e.g. http://10.40.40.63:5000 */
export function lanUrls(port) {
  return Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254'))
    .map(a => `http://${a.address}:${port}`);
}

/** Simple sliding-window limiter for public endpoints: true when `key` exceeded `max` hits in `windowMs`. */
const hits = new Map();
export function rateLimited(key, max, windowMs) {
  const now = Date.now(), l = (hits.get(key) || []).filter(t => now - t < windowMs);
  l.push(now); hits.set(key, l);
  return l.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, l] of hits) if (!l.some(t => now - t < 3600000)) hits.delete(k); }, 3600000).unref();
