/*
 * Attendance module.
 * NOTE: times are stored as "HH:MM" strings and dates as "YYYY-MM-DD" — all in
 * server-local time. Good enough for a single-office org; revisit if we go multi-tz.
 */
const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const env = require('../../config/env');
const { requireAuth, requireRole } = require('../../middleware/auth');
const Attendance = require('./attendance.model');
const { notify } = require('../notifications/notification.service');
const { User } = require('../auth/user.model');
const Employee = require('../employees/employee.model');

router.use(requireAuth);

const today = () => new Date().toISOString().slice(0, 10);
const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function requireEmployeeLink(req) {
  if (!req.user.employeeId) {
    throw ApiError.badRequest('Your account is not linked to an employee profile');
  }
  return req.user.employeeId;
}

// POST /api/attendance/clock-in
router.post(
  '/clock-in',
  asyncHandler(async (req, res) => {
    const employeeId = requireEmployeeLink(req);
    const date = today();

    const existing = await Attendance.findOne({ employee: employeeId, date });
    if (existing && existing.clockIn) {
      throw ApiError.conflict('Attendance already marked for today'); // ATT-01
    }

    const clockIn = nowHHMM();
    const isLate = toMinutes(clockIn) > toMinutes(env.attendance.officeStart);

    const record = await Attendance.findOneAndUpdate(
      { employee: employeeId, date },
      {
        clockIn,
        status: isLate ? 'Late' : 'Present',
        ...(req.body?.lat && req.body?.lng ? { location: { lat: req.body.lat, lng: req.body.lng } } : {}),
      },
      { new: true, upsert: true }
    );

    // Late arrival → manager gets a heads-up (notification matrix)
    if (isLate) {
      const emp = await Employee.findById(employeeId).populate('manager');
      if (emp?.manager) {
        const mgrUser = await User.findOne({ employee: emp.manager._id });
        if (mgrUser) await notify(mgrUser._id, 'LATE_ARRIVAL', `${emp.name} clocked in late at ${clockIn}.`);
      }
    }

    res.status(201).json({ success: true, attendance: record });
  })
);

// POST /api/attendance/clock-out
router.post(
  '/clock-out',
  asyncHandler(async (req, res) => {
    const employeeId = requireEmployeeLink(req);
    const record = await Attendance.findOne({ employee: employeeId, date: today() });
    if (!record || !record.clockIn) throw ApiError.badRequest('Clock in first');
    if (record.clockOut) throw ApiError.conflict('Already clocked out today');

    record.clockOut = nowHHMM();
    const mins = toMinutes(record.clockOut) - toMinutes(record.clockIn);
    record.workingHours = Math.round((mins / 60) * 100) / 100;

    // ATT-05: overtime after configured office hours
    record.overtime = Math.max(0, Math.round((record.workingHours - env.attendance.fullDayHours) * 100) / 100);

    // Half day if under threshold (don't downgrade Late)
    if (record.workingHours < env.attendance.halfDayThreshold) record.status = 'Half Day';

    await record.save();
    res.json({ success: true, attendance: record });
  })
);

// GET /api/attendance/me?month=2026-07
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const employeeId = requireEmployeeLink(req);
    const month = req.query.month || today().slice(0, 7);
    const records = await Attendance.find({
      employee: employeeId,
      date: { $regex: `^${month}` },
    }).sort('-date');
    res.json({ success: true, records });
  })
);

// GET /api/attendance?date=&employee=  — HR / managers / finance (read for payroll)
router.get(
  '/',
  requireRole('HR', 'ORG_ADMIN', 'MANAGER', 'TEAM_LEAD', 'FINANCE', 'AUDITOR'),
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.date) filter.date = req.query.date;
    if (req.query.employee) filter.employee = req.query.employee;
    if (req.query.month) filter.date = { $regex: `^${req.query.month}` };

    const records = await Attendance.find(filter)
      .populate('employee', 'employeeId name department')
      .sort('-date')
      .limit(500);
    res.json({ success: true, records });
  })
);

// POST /api/attendance/:id/correction — employee asks, manager decides (ATT-04)
router.post(
  '/:id/correction',
  asyncHandler(async (req, res) => {
    const { reason, requestedClockIn, requestedClockOut } = req.body || {};
    if (!reason) throw ApiError.badRequest('Correction reason is required');

    const record = await Attendance.findById(req.params.id);
    if (!record) throw ApiError.notFound('Attendance record not found');
    if (String(record.employee) !== String(req.user.employeeId)) {
      throw ApiError.forbidden('Not your attendance record');
    }

    record.correction = { requested: true, reason, requestedClockIn, requestedClockOut, state: 'Pending' };
    await record.save();
    res.json({ success: true, attendance: record });
  })
);

// PATCH /api/attendance/:id/correction — approve/reject
router.patch(
  '/:id/correction',
  requireRole('MANAGER', 'TEAM_LEAD', 'HR', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const { decision } = req.body || {}; // 'Approved' | 'Rejected'
    if (!['Approved', 'Rejected'].includes(decision)) {
      throw ApiError.badRequest("decision must be 'Approved' or 'Rejected'");
    }

    const record = await Attendance.findById(req.params.id);
    if (!record || record.correction?.state !== 'Pending') {
      throw ApiError.notFound('No pending correction on this record');
    }

    record.correction.state = decision;
    if (decision === 'Approved') {
      if (record.correction.requestedClockIn) record.clockIn = record.correction.requestedClockIn;
      if (record.correction.requestedClockOut) record.clockOut = record.correction.requestedClockOut;
      if (record.clockIn && record.clockOut) {
        const mins = toMinutes(record.clockOut) - toMinutes(record.clockIn);
        record.workingHours = Math.round((mins / 60) * 100) / 100;
        record.overtime = Math.max(0, Math.round((record.workingHours - env.attendance.fullDayHours) * 100) / 100);
        record.status = record.workingHours < env.attendance.halfDayThreshold ? 'Half Day' : 'Present';
      }
    }
    await record.save();

    const empUser = await User.findOne({ employee: record.employee });
    if (empUser) {
      await notify(empUser._id, 'CORRECTION_DECISION', `Your attendance correction for ${record.date} was ${decision.toLowerCase()}.`);
    }

    res.json({ success: true, attendance: record });
  })
);

module.exports = router;
