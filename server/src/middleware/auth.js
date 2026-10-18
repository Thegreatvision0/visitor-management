import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { getRoles, getSettings, HttpError } from '../lib/core.js';
import { resolveVisitCaps } from '../../../shared/constants.js';

export const signToken = user => jwt.sign({ sub: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });

/** Verifies the Bearer token and attaches req.user (with its role's page access in req.user.pages). */
export async function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Please sign in.'));
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch { return next(new HttpError(401, 'Your session has expired. Please sign in again.')); }
  const u = await User.findById(payload.sub).lean();
  if (!u) return next(new HttpError(401, 'This account no longer exists.'));
  const roles = await getRoles();
  req.roles = roles;
  /* guest visit permissions = the role's (Admin → Guest visit access) + this user's extras */
  const vcaps = [...new Set([...(resolveVisitCaps((await getSettings()).visitCaps)[u.role] || []), ...(u.visitCaps || [])])];
  const pages = { ...(roles[u.role] || { pages: {} }).pages };
  /* a permission opens the Guest Visits page: any action (invite, accept, approve, gate) needs edit access */
  if (vcaps.some(c => c !== 'all')) pages.visitors = 'e'; else if (vcaps.length && !pages.visitors) pages.visitors = 'v';
  req.user = { id: u._id, _id: u._id, name: u.name, username: u.username, role: u.role, branchId: u.branchId || '', deptId: u.deptId || '', mustChangePassword: !!u.mustChangePassword, pages, vcaps };
  /* a temporary password only allows choosing a new one */
  if (u.mustChangePassword && !['/me', '/password'].includes(req.path)) return next(new HttpError(403, 'Please choose a new password before continuing.'));
  next();
}

export const can = (user, page) => !!user.pages[page];
export const canEdit = (user, page) => user.pages[page] === 'e';
export const isMgmt = user => ['superadmin', 'manager'].includes(user.role);

/** Route guard: the user's role must have `level` ('v' or 'e') on any of the listed pages. */
export const need = (pages, level = 'e') => (req, res, next) => {
  const list = Array.isArray(pages) ? pages : [pages];
  const ok = list.some(p => level === 'e' ? canEdit(req.user, p) : can(req.user, p));
  if (!ok) return next(new HttpError(403, 'Your role does not allow this action.'));
  next();
};
export const superOnly = (req, res, next) => req.user.role === 'superadmin' ? next() : next(new HttpError(403, 'Super Admin only.'));
