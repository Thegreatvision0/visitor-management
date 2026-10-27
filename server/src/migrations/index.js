/* Data migrations. MongoDB has no schema migrations, so each change that has to touch existing
   records is written here once, runs at start-up, and is recorded in the `migrations` collection
   (it never runs twice). Migrations only add or fill fields — they never drop data.
   To add one: append { id: 'NNN-what-it-does', up: async db => { … } } to the list. */
import mongoose from 'mongoose';

export const MIGRATIONS = [
  { id: '001-notification-kinds', note: 'Tag older task notifications so they disappear once the task is done', up: async db => {
    const set = (re, kind) => db.collection('notifications').updateMany({ kind: { $exists: false }, text: { $regex: re } }, { $set: { kind } });
    await set('awaiting approval$', 'approve'); await set('^Extension request:', 'ext'); await set('approved — expected', 'arrive');
    await set('needs a bed$', 'bed'); await set('assign a sewa department$', 'duty'); await set('needs cleaning$', 'clean');
    await set('^(New|Updated) appointment request', 'v-incharge'); await set('^Approval needed:', 'v-office'); await set('^Expected:', 'v-gate');
  } },
  { id: '002-stay-rules', note: 'Stay-type day limits stored in settings (Admin → Lists & options)', up: async db => {
    await db.collection('settings').updateOne({ _id: 'app', 'lists.stayRules': { $exists: false } }, { $set: { 'lists.stayRules': { shortMax: 10, monthlyMax: 30 } } });
  } },
  { id: '003-bed-lock-index', note: 'Bed locks expire by themselves after 60 seconds', up: async db => {
    await db.collection('bedlocks').createIndex({ at: 1 }, { expireAfterSeconds: 60 });
  } }
];

/** Run every migration not yet recorded. Returns the ids that ran. */
export async function runMigrations() {
  const db = mongoose.connection.db, done = new Set((await db.collection('migrations').find({}, { projection: { _id: 1 } }).toArray()).map(x => x._id)), ran = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await m.up(db);
    await db.collection('migrations').insertOne({ _id: m.id, note: m.note, at: new Date().toISOString() });
    ran.push(m.id);
  }
  if (ran.length) console.log('Migrations applied: ' + ran.join(', '));
  return ran;
}
