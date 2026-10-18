import express from 'express';
import cors from 'cors';
import compression from 'compression';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authenticate } from './middleware/auth.js';
import { serialWrites, HttpError, getSettings, getRev } from './lib/core.js';
import { ensureDemoUsers, isEmpty, replaceAll, snapshot, ensureAllStates } from './services/data.js';
import { markRead } from './services/notify.js';
import { securityHeaders, productionChecks, lanUrls, isProd } from './lib/security.js';
import { buildSample } from './services/sample.js';
import authRoutes from './routes/auth.js';
import peopleRoutes from './routes/people.js';
import regRoutes from './routes/regs.js';
import accRoutes from './routes/accommodation.js';
import deptRoutes from './routes/departments.js';
import adminRoutes from './routes/admin.js';
import visitRoutes from './routes/visits.js';
import publicRoutes from './routes/public.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(compression()); // smaller responses — faster on phones and mobile data
  if (process.env.CORS_ORIGIN) app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map(s => s.trim()) }));
  app.use('/api/admin/import', express.json({ limit: '50mb' })); // backups can be large; every other route gets 2 MB
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', serialWrites);

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes); // guest registration links — no sign-in
  app.use('/api', authenticate);
  app.get('/api/snapshot', async (req, res) => res.json(await snapshot(req.user))); // everything the user may see
  app.get('/api/rev', async (req, res) => res.json({ rev: await getRev() })); // polled by the browser to auto-refresh
  app.post('/api/notifications/read', async (req, res) => {
    const ids = ((req.body || {}).ids || []).filter(x => mongoose.isValidObjectId(x));
    await markRead(req.user, ids); res.json({ ok: true });
  });
  app.use('/api', peopleRoutes);
  app.use('/api', deptRoutes);
  app.use('/api/regs', regRoutes);
  app.use('/api/accommodation', accRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/visits', visitRoutes);
  app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found.')));

  /* In production the built React app is served from client/dist. */
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  /* hashed build files never change → cache for a year; everything else is revalidated so updates show at once */
  app.use(express.static(dist, { setHeaders: (res, p) => res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(p) ? 'public, max-age=31536000, immutable' : 'no-cache') }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.setHeader('Cache-Control', 'no-cache');
    const index = path.join(dist, 'index.html');
    if (fs.existsSync(index)) return res.sendFile(index); // checked per request: a new build is picked up without a restart
    /* no build yet: say what to do instead of a bare "Cannot GET /" */
    res.status(503).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DJJS Nurmahal</title>
      <div style="font:15px/1.6 system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 20px;color:#0f172a">
      <h2>The web app has not been built yet</h2><p>The server is running, but the app's pages are missing (<code>client/dist</code>).</p>
      <p>In the project folder run:</p><pre style="background:#f3f5f9;padding:10px 14px;border-radius:8px">npm run build</pre>
      <p>then refresh this page. For development use <code>npm run dev</code> and open <a href="http://localhost:5173">http://localhost:5173</a>.</p></div>`);
  });

  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
  });
  return app;
}

export async function bootstrapData() {
  await getSettings();
  await ensureAllStates();
  if (process.env.SEED_ON_EMPTY !== 'false' && await isEmpty()) {
    await replaceAll(buildSample());
    console.log('Database was empty — sample data loaded.');
  }
  if (await ensureDemoUsers()) console.log(`Demo users created (password: ${process.env.SEED_PASSWORD || 'Noormahal@123'}). See README.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (!process.env.JWT_SECRET) { console.error('JWT_SECRET is not set. Copy server/.env.example to server/.env.'); process.exit(1); }
  productionChecks();
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/noormahal';
  await mongoose.connect(uri);
  console.log('MongoDB connected');
  await bootstrapData();
  const port = Number(process.env.PORT) || 5000;
  createApp().listen(port, () => {
    console.log(`${isProd() ? 'Production' : 'Development'} server on http://localhost:${port}`);
    lanUrls(port).forEach(u => console.log('  Office network: ' + u));
  });
}
