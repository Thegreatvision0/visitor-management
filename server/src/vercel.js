/* Vercel entry: one serverless function runs the whole API (api/index.mjs re-exports this).
   The React app is served by Vercel's CDN from client/dist; the database connection is reused between requests. */
process.env.TZ = process.env.APP_TZ || 'Asia/Kolkata'; // Vercel does not allow a TZ variable; dates ("today") need Indian time
import mongoose from 'mongoose';
import { createApp, bootstrapData } from './index.js';

const app = createApp();
let ready = null;
function boot() {
  if (!ready) ready = (async () => {
    const missing = ['MONGODB_URI', 'JWT_SECRET'].filter(k => !process.env[k]);
    if (missing.length) throw new Error('Missing environment variable(s) in Vercel: ' + missing.join(', '));
    if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be a long random string (32+ characters).');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await bootstrapData();
  })().catch(e => { ready = null; throw e; }); // try again on the next request
  return ready;
}

/** A cause the admin can act on, shown on the sign-in screen — never the connection string or password. */
function reason(e) {
  const m = String(e && e.message || '');
  if (/^Missing environment|^JWT_SECRET/.test(m)) return m + ' (Vercel → Settings → Environment Variables, then redeploy).';
  if (/bad auth|Authentication failed|auth.*fail/i.test(m)) return 'MongoDB Atlas rejected the user name or password in MONGODB_URI.';
  if (/whitelist|access list|timed out|Server selection/i.test(m)) return 'MongoDB Atlas did not answer — in Atlas → Network Access allow 0.0.0.0/0.';
  if (/ENOTFOUND|querySrv|ENODATA/i.test(m)) return 'The cluster address in MONGODB_URI was not found — copy it again from Atlas.';
  if (/Invalid scheme|Invalid connection string|URI must|Password contains|Username contains/i.test(m)) return 'MONGODB_URI is not a valid MongoDB address.';
  return 'database or settings problem. See Vercel → Logs.';
}

export default async function handler(req, res) {
  try { await boot(); }
  catch (e) {
    console.error('Start-up failed:', e.message);
    res.statusCode = 503; res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'The server could not start: ' + reason(e) }));
  }
  return app(req, res);
}
