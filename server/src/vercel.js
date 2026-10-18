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

export default async function handler(req, res) {
  try { await boot(); }
  catch (e) {
    console.error('Start-up failed:', e.message);
    res.statusCode = 503; res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'The server could not start (database or settings). Check the Vercel logs.' }));
  }
  return app(req, res);
}
