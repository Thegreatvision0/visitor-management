/* npm run seed — replace all sewadar data with the sample data set and create demo users if none exist.
   Existing sign-in users are kept. */
import mongoose from 'mongoose';
import { replaceAll, ensureDemoUsers } from './services/data.js';
import { buildSample } from './services/sample.js';
import { getSettings } from './lib/core.js';

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/noormahal');
await getSettings();
await replaceAll(buildSample());
const created = await ensureDemoUsers();
console.log('Sample data loaded.' + (created ? ` Demo users created (password: ${process.env.SEED_PASSWORD || 'Noormahal@123'}).` : ' Existing users kept.'));
await mongoose.disconnect();
