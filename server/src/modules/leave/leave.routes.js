const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { Leave, LeaveBalance, LEAVE_TYPES } = require('./leave.model');
const { User } = require('../auth/user.model');
const Employee = require('../employees/employee.model');
const { notify } = require('../notifications/notification.service');

router.use(requireAuth);

const isoToday = () => new Date().toISOString().slice(0, 10);

const inclusiveDays = (start, end) => {
  const ms = new Date(end) - new Date(start);
  return ms / 86400000 + 1;
};

async function getOrCreateBalance(employeeId) {
  const year = new Date().getFullYear();
  let doc = await LeaveBalance.findOne({ employee: employeeId, year });
  if (!doc) doc = await LeaveBalance.create({ employee: employeeId, year });
  return doc;
}

// GET /api/leave/balance — my remaining leave per type
router.get(
  '/balance',
  asyncHandler(async (req, res) => {
    if (!req.user.employeeId) throw ApiError.badRequest('No employee profile linked');
    const doc = await getOrCreateBalance(req.user.employeeId);
    res.json({
      success: true,
      year: doc.year,
      balances: Object.fromEntries(doc.balances),
      allocations: LEAVE_TYPES,
    });
  })
);

// POST /api/leave — apply
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user.employeeId) throw ApiError.badRequest('No employee profile linked');
    const { leaveType, startDate, endDate, reason } = req.body || {};

    if (!leaveType || !startDate || !endDate || !reason) {
      throw ApiError.badRequest('leaveType, startDate, endDate and reason are required');
    }
    if (!Object.keys(LEAVE_TYPES).includes(leaveType)) throw ApiError.badRequest('Unknown leave type');
    if (startDate < isoToday()) throw ApiError.badRequest('Past leave cannot be applied'); // rule
    if (endDate < startDate) throw ApiError.badRequest('endDate before startDate');

    const days = inclusiveDays(startDate, endDate);

    // Rule: leave balance cannot be negative — verify up front
    const balanceDoc = await getOrCreateBalance(req.user.employeeId);
    const available = balanceDoc.balances.get(leaveType) ?? 0;
    if (days > available) {
      throw ApiError.badRequest(`Insufficient balance: ${available} day(s) of ${leaveType} left`);
    }

    // No overlapping pending/approved leave
    const clash = await Leave.findOne({
      employee: req.user.employeeId,
      status: { $in: ['Pending', 'Approved'] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });
    if (clash) throw ApiError.conflict('You already have leave overlapping those dates');

    const leave = await Leave.create({
      employee: req.user.employeeId,
      leaveType, startDate, endDate, days, reason,
    });

    // Rule: manager approval mandatory → tell the manager
    const emp = await Employee.findById(req.user.employeeId);
    if (emp?.manager) {
      const mgrUser = await User.findOne({ employee: emp.manager });
      if (mgrUser) await notify(mgrUser._id, 'LEAVE_APPLIED', `${emp.name} applied for ${days} day(s) of ${leaveType}.`);
    }

    res.status(201).json({ success: true, leave });
  })
);

// GET /api/leave/me — my requests
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.user.employeeId) throw ApiError.badRequest('No employee profile linked');
    const leaves = await Leave.find({ employee: req.user.employeeId }).sort('-createdAt');
    res.json({ success: true, leaves });
  })
);

// GET /api/leave/pending — approval queue for managers/HR
router.get(
  '/pending',
  requireRole('MANAGER', 'TEAM_LEAD', 'HR', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    let filter = { status: 'Pending' };

    // Managers/team-leads only see their direct reports; HR sees all.
    if (['MANAGER', 'TEAM_LEAD'].includes(req.user.role)) {
      const reports = await Employee.find({ manager: req.user.employeeId }).select('_id');
      filter.employee = { $in: reports.map((r) => r._id) };
    }

    const leaves = await Leave.find(filter)
      .populate('employee', 'employeeId name department')
      .sort('createdAt');
    res.json({ success: true, leaves });
  })
);

// PATCH /api/leave/:id/decide  { decision: 'Approved' | 'Rejected' }
router.patch(
  '/:id/decide',
  requireRole('MANAGER', 'TEAM_LEAD', 'HR', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const { decision } = req.body || {};
    if (!['Approved', 'Rejected'].includes(decision)) {
      throw ApiError.badRequest("decision must be 'Approved' or 'Rejected'");
    }

    const leave = await Leave.findById(req.params.id).populate('employee', 'name manager');
    if (!leave) throw ApiError.notFound('Leave request not found');
    if (leave.status !== 'Pending') throw ApiError.conflict(`Leave already ${leave.status.toLowerCase()}`);

    // Managers can only decide for their own reports (HR/admin bypass)
    if (['MANAGER', 'TEAM_LEAD'].includes(req.user.role)) {
      if (String(leave.employee.manager) !== String(req.user.employeeId)) {
        throw ApiError.forbidden('Not your direct report');
      }
    }

    if (decision === 'Approved') {
      // Rule: leave deducted automatically, balance can never go negative
      const balanceDoc = await getOrCreateBalance(leave.employee._id);
      const available = balanceDoc.balances.get(leave.leaveType) ?? 0;
      if (leave.days > available) {
        throw ApiError.conflict(`Balance changed: only ${available} day(s) left`);
      }
      balanceDoc.balances.set(leave.leaveType, available - leave.days);
      await balanceDoc.save();
    }

    leave.status = decision;
    leave.decidedBy = req.user.id;
    leave.decidedAt = new Date();
    await leave.save();

    // notification matrix: approved/rejected → employee; HR notified after approval
    const empUser = await User.findOne({ employee: leave.employee._id });
    if (empUser) await notify(empUser._id, `LEAVE_${decision.toUpperCase()}`, `Your ${leave.leaveType} (${leave.startDate} → ${leave.endDate}) was ${decision.toLowerCase()}.`);
    if (decision === 'Approved') {
      const hrUsers = await User.find({ role: 'HR', isActive: true }).select('_id');
      await Promise.all(hrUsers.map((u) => notify(u._id, 'LEAVE_APPROVED_HR', `${leave.employee.name}'s ${leave.leaveType} approved.`)));
    }

    res.json({ success: true, leave });
  })
);

// PATCH /api/leave/:id/cancel — own pending leave only
router.patch(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const leave = await Leave.findById(req.params.id);
    if (!leave) throw ApiError.notFound('Leave request not found');
    if (String(leave.employee) !== String(req.user.employeeId)) throw ApiError.forbidden('Not your leave request');
    if (leave.status !== 'Pending') throw ApiError.conflict('Only pending leave can be cancelled');

    leave.status = 'Cancelled';
    await leave.save();

    const hrUsers = await User.find({ role: 'HR', isActive: true }).select('_id');
    await Promise.all(hrUsers.map((u) => notify(u._id, 'LEAVE_CANCELLED', `A leave request was cancelled.`)));

    res.json({ success: true, leave });
  })
);

module.exports = router;
