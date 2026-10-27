/* Bed booking lock.
   The overlap check ("is this bed free for these dates?") and the booking are two steps. Within one server
   process the write queue already runs them one at a time; on Vercel several copies of the server run side by
   side, so a lock document per bed in the database makes the two steps atomic everywhere: only one request can
   hold a bed's lock, the others wait a moment. A lock left behind by a crashed request expires after ~1 minute
   (TTL index, migration 003). Works on any MongoDB — no replica set or transactions needed. */
import mongoose from 'mongoose';
import { HttpError } from './core.js';
import { feature } from './config.js';

const locks = () => mongoose.connection.db.collection('bedlocks');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Run fn while holding the locks of the given beds (always taken in the same order, so two requests never deadlock). */
export async function withBedLocks(bedIds, fn) {
  if (!feature('bedLock')) return fn();
  const ids = [...new Set((bedIds || []).filter(Boolean).map(String))].sort(), held = [];
  try {
    for (const id of ids) {
      for (let tries = 0; ; tries++) {
        try { await locks().insertOne({ _id: 'bed:' + id, at: new Date() }); held.push('bed:' + id); break; }
        catch (e) {
          if (e.code !== 11000) throw e;                       // 11000 = someone else holds it
          if (tries >= 60) throw new HttpError(409, 'Another booking for this bed is being saved right now. Please try again in a moment.');
          await sleep(100);
        }
      }
    }
    return await fn();
  } finally {
    if (held.length) await locks().deleteMany({ _id: { $in: held } });
  }
}
