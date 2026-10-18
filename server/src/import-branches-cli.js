/* npm run import-branches — add / update all branches from the official DJJS list (src/data/djjs-branches.json). */
import mongoose from 'mongoose';
import { importDjjsBranches } from './services/branches-import.js';
import { getSettings } from './lib/core.js';

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/noormahal');
await getSettings();
const r = await importDjjsBranches(null);
console.log(`Official DJJS branch list (${r.source}, fetched ${r.fetched}): ${r.total} branches — ${r.created} added, ${r.updated} updated.`);
if (r.sampleLeft.length) console.log(`${r.sampleLeft.length} sample branch(es) not on the official list remain: ${r.sampleLeft.join(', ')}`);
await mongoose.disconnect();
