/* Sewa departments, duty records and attendance. */
import { Router } from 'express';
import { Department, Duty, Attendance, Registration } from '../models/index.js';
import { need } from '../middleware/auth.js';
import { nid, log, fail, notFound, forbidden } from '../lib/core.js';
import { body, check, isDate, oneOf } from '../lib/validate.js';
import { deleteDept, canDept, dutyOn, onSite, assertRegScope, getReg, scopeRegIds, memberName } from '../services/domain.js';
import { today } from '../../../shared/dates.js';
import { ATT } from '../../../shared/constants.js';

const r = Router();
const ok = res => res.json({ ok: true });
const notSupervisor = (req, res, next) => req.user.role === 'supervisor' ? next(forbidden('Department supervisors cannot add or remove departments.')) : next();

async function saveDept(req, id) {
  const v = body(req, ['name', 'supervisor', 'active']); check(v, [['name', 'Department name', 'req'], ['supervisor', 'Supervisor', 'req']]);
  if ((await Department.find({ _id: { $ne: id || null } }).lean()).some(x => x.name.toLowerCase() === v.name.toLowerCase())) fail('A department with this name exists.');
  const active = v.active === true || v.active === 'Yes';
  let d = id ? await Department.findById(id) : null;
  if (id && !d) notFound('Department');
  if (!d) d = new Department({ _id: await nid('dp') });
  Object.assign(d, { name: v.name, supervisor: v.supervisor, active }); await d.save();
  await log(req.user, 'Saved department ' + v.name);
  return d._id;
}
r.post('/depts', need('departments'), notSupervisor, async (req, res) => res.json({ id: await saveDept(req, null) }));
r.put('/depts/:id', need('departments'), notSupervisor, async (req, res) => res.json({ id: await saveDept(req, req.params.id) }));
r.delete('/depts/:id', need('departments'), notSupervisor, async (req, res) => { await deleteDept(req.user, req.params.id); ok(res); });

r.delete('/duties/:id', need('departments'), async (req, res) => {
  const d = await Duty.findById(req.params.id); if (!d) notFound('Duty record');
  if (!canDept(req.user, d.deptId)) forbidden('This duty is in another department.');
  await assertRegScope(req.user, await getReg(d.regId));
  await Duty.deleteOne({ _id: d._id }); await log(req.user, 'Deleted duty record ' + d._id); ok(res);
});

/* ---------- attendance ---------- */
r.post('/attendance', need('departments'), async (req, res) => {
  const v = body(req, ['date', 'regId', 'status']); check(v, [['date', 'Date', 'req'], ['regId', 'Member', 'req']]); isDate(v.date, 'Date'); oneOf(v.status, ATT, 'attendance status');
  if (v.date > today()) fail('Attendance cannot be marked for a future date.');
  const g = await getReg(v.regId); await assertRegScope(req.user, g);
  const du = await dutyOn(g._id, v.date);
  if (!du) fail('This member has no sewa duty on that date.');
  if (!canDept(req.user, du.deptId)) forbidden('You can only mark attendance in your own department.');
  if (v.status === 'Not Marked') await Attendance.deleteOne({ date: v.date, regId: g._id });
  else await Attendance.updateOne({ date: v.date, regId: g._id }, { status: v.status, deptId: du.deptId }, { upsert: true });
  ok(res);
});
/** Set every unmarked member on duty (and on site) that day to Present. */
r.post('/attendance/mark-all', need('departments'), async (req, res) => {
  const v = body(req, ['date', 'deptId']); check(v, [['date', 'Date', 'req']]); isDate(v.date, 'Date');
  if (v.date > today()) fail('Attendance cannot be marked for a future date.');
  const ids = await scopeRegIds(req.user);
  const q = { from: { $lte: v.date }, to: { $gte: v.date } };
  if (v.deptId) q.deptId = v.deptId;
  if (ids) q.regId = { $in: ids };
  let n = 0;
  for (const d of await Duty.find(q).lean()) {
    if (!canDept(req.user, d.deptId)) continue;
    const g = await Registration.findById(d.regId).lean();
    if (!g || !onSite(g, v.date)) continue;
    const cur = await dutyOn(d.regId, v.date); if (!cur || cur._id !== d._id) continue;
    if (await Attendance.exists({ date: v.date, regId: d.regId })) continue;
    await Attendance.create({ date: v.date, regId: d.regId, status: 'Present', deptId: d.deptId }); n++;
  }
  await log(req.user, 'Bulk attendance for ' + v.date);
  res.json({ ok: true, marked: n });
});

export default r;
