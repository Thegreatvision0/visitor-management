import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { HttpError, fail, log } from '../lib/core.js';
import { clientIp, loginBlocked, loginFailed, loginOk, isProd, demoPassword } from '../lib/security.js';

const r = Router();

r.post('/login', async (req, res) => {
  const username = String((req.body || {}).username || '').trim().toLowerCase(), password = String((req.body || {}).password || '');
  const ip = clientIp(req), wait = loginBlocked(ip, username);
  if (wait) throw new HttpError(429, `Too many failed sign-in attempts. Please try again in ${wait} minute${wait > 1 ? 's' : ''}.`);
  const u = username && await User.findOne({ username });
  if (!u || !u.passwordHash || !(await bcrypt.compare(password, u.passwordHash))) {
    loginFailed(ip, username); console.warn(`Failed sign-in for "${username}" from ${ip}`);
    throw new HttpError(401, 'Wrong username or password.');
  }
  loginOk(ip, username);
  /* on the live system the well-known demo password must be replaced at once */
  if (isProd() && password === demoPassword() && !u.mustChangePassword) { u.mustChangePassword = true; await u.save(); }
  res.json({ token: signToken(u), mustChangePassword: !!u.mustChangePassword });
});

r.use(authenticate);

r.get('/me', (req, res) => { const { pages, _id, ...u } = req.user; res.json(u); });

r.post('/password', async (req, res) => {
  const { current = '', next = '' } = req.body || {};
  if (String(next).length < 8) fail('The new password must have at least 8 characters.');
  if (String(next) === String(current)) fail('Choose a password different from the current one.');
  if (isProd() && String(next) === demoPassword()) fail('This is the demo password — choose your own.');
  const u = await User.findById(req.user.id);
  if (!(await bcrypt.compare(String(current), u.passwordHash || ''))) fail('The current password is not correct.');
  u.passwordHash = await bcrypt.hash(String(next), 10); u.mustChangePassword = false; await u.save();
  await log(req.user, 'Changed own password');
  res.json({ ok: true });
});

export default r;
