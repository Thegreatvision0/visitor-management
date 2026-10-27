/* Run-time switches read from the environment: DEMO mode and feature flags. */
import { resolveFeatures } from '../../../shared/features.js';

/** DEMO_MODE=true: separate demo database, sample data seeded, danger-zone tools and "view as role" allowed. */
export const isDemo = () => process.env.DEMO_MODE === 'true';
/** The demo data lives in its own database, never in the production one. */
export const demoDbName = () => process.env.DEMO_DB_NAME || 'noormahal_demo';
/** Mongoose connect options: in DEMO mode the database name is forced to the demo one. */
export const dbOptions = () => isDemo() ? { dbName: demoDbName() } : {};

let cached = null, cachedFor = null;
/** Effective feature switches (shared/features.js defaults + FEATURES env). */
export function features() {
  const key = (process.env.FEATURES || '') + '|' + isDemo();
  if (cachedFor !== key) { cached = resolveFeatures(process.env.FEATURES, isDemo()); cachedFor = key; }
  return cached;
}
export const feature = k => !!features()[k];
