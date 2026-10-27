/* Feature switches — the one place to turn new features on or off.
   Change a default here, or override on the server without editing code:
     FEATURES="maskMobiles=off,arrivalNeedsBed=on"
   The server sends the effective switches to the browser (GET /api/meta and the data snapshot). */
export const FEATURES = {
  dangerZone:      { on: false, label: 'Admin → Data: "Delete everything", "Reset to sample data", "Delete all members & visits" (always available in DEMO mode)' },
  archive:         { on: true,  label: 'Archive / restore branches, departments and requests instead of deleting them' },
  kpiHelp:         { on: true,  label: 'Dashboard, Reception and Accommodation counts share one definition, with an ⓘ explanation' },
  bedLock:         { on: true,  label: 'Bed booking lock: two people can never get the same bed for overlapping dates, even when saved at the same moment' },
  stayRules:       { on: true,  label: 'Stay-type day limits editable in Admin → Lists & options; manual override flagged in the approval review' },
  arrivalNeedsBed: { on: true,  label: 'Reception: "Confirm arrival" asks for a bed (only free beds of the right gender and dates) when none is assigned' },
  duplicateMobile: { on: true,  label: 'Member form warns while typing when the mobile number is already used' },
  maskMobiles:     { on: true,  label: 'Mobile numbers shown as 98XXXXX280 to roles without "See mobile numbers"; "Reveal" is written to the audit log' }
};
export const FEATURE_KEYS = Object.keys(FEATURES);

/** Effective switches from the defaults and a FEATURES="a=on,b=off" string. */
export function resolveFeatures(spec = '', demo = false) {
  const out = Object.fromEntries(FEATURE_KEYS.map(k => [k, FEATURES[k].on]));
  String(spec || '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => {
    const [k, v = 'on'] = x.split('=').map(y => y.trim());
    if (k in out) out[k] = !/^(off|false|0|no)$/i.test(v);
  });
  if (demo) out.dangerZone = true;
  return out;
}
