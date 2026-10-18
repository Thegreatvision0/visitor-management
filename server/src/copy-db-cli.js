/* Copy the whole database to another MongoDB (e.g. MongoDB Atlas for Vercel) — no extra tools needed.
   npm run copy-db --prefix server -- "<target uri>"            (target must be empty)
   npm run copy-db --prefix server -- "<target uri>" --replace  (overwrite what is there) */
import { MongoClient } from 'mongodb';

const [target, flag] = process.argv.slice(2);
const source = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/noormahal';
if (!target || !/^mongodb(\+srv)?:\/\//.test(target)) {
  console.error('Usage: npm run copy-db --prefix server -- "mongodb+srv://user:pass@cluster.../noormahal"');
  process.exit(1);
}
const from = new MongoClient(source), to = new MongoClient(target, { serverSelectionTimeoutMS: 15000 });
try {
  await from.connect(); await to.connect();
  const src = from.db(), dst = to.db(); // database names come from the two addresses
  if (src.databaseName === dst.databaseName && source === target) throw new Error('Source and target are the same.');
  const names = (await src.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name).filter(n => !n.startsWith('system.'));
  const existing = (await dst.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name);
  if (existing.length && flag !== '--replace') throw new Error(`Target database "${dst.databaseName}" already has data (${existing.join(', ')}). Add --replace to overwrite it.`);
  console.log(`Copying "${src.databaseName}" → "${dst.databaseName}" (${names.length} collections)`);
  for (const n of names) {
    const docs = await src.collection(n).find().toArray();
    if (existing.includes(n)) await dst.collection(n).drop();
    for (let i = 0; i < docs.length; i += 1000) await dst.collection(n).insertMany(docs.slice(i, i + 1000), { ordered: false });
    console.log(`  ${n}: ${docs.length}`);
  }
  console.log('Done. Indexes are created by the app when it starts.');
} catch (e) {
  console.error('Copy failed: ' + e.message);
  if (/ENOTFOUND|timed out|Server selection/i.test(e.message)) console.error('Check the address and Atlas → Network Access (allow 0.0.0.0/0 or this PC).');
  if (/auth/i.test(e.message)) console.error('Wrong Atlas user name or password.');
  process.exitCode = 1;
} finally { await from.close(); await to.close(); }
