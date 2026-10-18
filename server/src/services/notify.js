/* Event notifications, delivered according to each user's role, page access and scope. */
import { Notification, Branch } from '../models/index.js';
import { nowLocal } from '../../../shared/dates.js';

/**
 * notify(user, { text, page, level = 'v', roles, userId, branchId, deptId, regId })
 * Visible to `userId` only when given; otherwise to every user whose role has `level`
 * access to `page` (and is listed in `roles`, when given). Coordinators only see
 * notices for their branch family, supervisors only for their department.
 * The user who caused the event does not get it.
 */
export async function notify(user, n) {
  await Notification.create({ at: nowLocal(), level: 'v', ...n, byUser: user && user.id ? user.id : '' });
  const old = await Notification.find({}, { _id: 1 }).sort({ at: -1, _id: -1 }).skip(1000).lean();
  if (old.length) await Notification.deleteMany({ _id: { $in: old.map(x => x._id) } });
}

/** All branch ids in the family of `branchId`: the branch itself and every sub-branch below it. */
export async function branchFamily(branchId) {
  if (!branchId) return [];
  const all = await Branch.find({}, { _id: 1, parentId: 1 }).lean(), out = [branchId];
  for (let i = 0; i < out.length; i++) all.forEach(b => { if (b.parentId === out[i] && !out.includes(b._id)) out.push(b._id); });
  return out;
}

const meets = (have, need) => have === 'e' || (have === 'v' && need === 'v');
/** The latest notifications this user may see, newest first, each with a `read` flag. */
export async function notificationsFor(user, limit = 40) {
  const fam = user.role === 'coordinator' ? await branchFamily(user.branchId) : null;
  const list = await Notification.find({ byUser: { $ne: user.id } }).sort({ at: -1, _id: -1 }).limit(400).lean();
  const out = [];
  for (const n of list) {
    let ok;
    if (n.userId) ok = n.userId === user.id;
    else if (n.cap) ok = (user.vcaps || []).includes(n.cap) && (n.cap !== 'incharge' || (!!n.deptId && n.deptId === user.deptId)); // permission-based (guest visits)
    else {
      ok = meets(user.pages[n.page], n.level || 'v') && (!n.roles || !n.roles.length || n.roles.includes(user.role));
      if (ok && user.role === 'coordinator') ok = !!n.branchId && fam.includes(n.branchId);
      if (ok && user.role === 'supervisor') ok = !!n.deptId && n.deptId === user.deptId;
    }
    if (ok) out.push({ id: String(n._id), at: n.at, text: n.text, page: n.page, regId: n.regId || '', read: (n.readBy || []).includes(user.id) });
    if (out.length >= limit) break;
  }
  return out;
}

export async function markRead(user, ids) {
  await Notification.updateMany({ _id: { $in: ids } }, { $addToSet: { readBy: user.id } });
}
