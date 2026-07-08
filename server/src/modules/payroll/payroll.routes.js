/*
 * Payroll module.
 *
 * Salary math (documented here AND in the README — keep them in sync):
 *   HRA            = 20% of basic
 *   Overtime pay   = overtime hours x (basic / (22 working days x 9h)) x 1.5
 *   PF             = 12% of basic, capped at 1800
 *   Professional tax = 200 flat
 *   Income tax     = 5% of gross when gross > 50,000 (simplified slab)
 *   Unpaid-leave deduction = absent days beyond approved leave x per-day basic
 *   Net = basic + HRA + bonus + overtime - all deductions
 */
const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { requireAuth, requireRole } = require('../../middleware/auth');
const Payroll = require('./payroll.model');
const Employee = require('../employees/employee.model');
const Attendance = require('../attendance/attendance.model');
const { Leave } = require('../leave/leave.model');
const { User } = require('../auth/user.model');
const { notify } = require('../notifications/notification.service');
const env = require('../../config/env');

router.use(requireAuth);

const WORKING_DAYS = 22;
const round2 = (n) => Math.round(n * 100) / 100;

async function computePayroll(employee, month) {
  // Rule: attendance mandatory before payroll
  const attendance = await Attendance.find({ employee: employee._id, date: { $regex: `^${month}` } });
  if (attendance.length === 0) {
    throw ApiError.badRequest(`No attendance records for ${employee.employeeId} in ${month}`);
  }

  const presentDays = attendance.filter((a) => ['Present', 'Late', 'Work From Home'].includes(a.status)).length;
  const halfDays = attendance.filter((a) => a.status === 'Half Day').length;
  const overtimeHours = attendance.reduce((sum, a) => sum + (a.overtime || 0), 0);

  // Approved leave days overlapping this month count as paid days.
  const approvedLeaves = await Leave.find({
    employee: employee._id,
    status: 'Approved',
    startDate: { $lte: `${month}-31` },
    endDate: { $gte: `${month}-01` },
  });
  const leaveDays = approvedLeaves.reduce((sum, l) => sum + l.days, 0);

  const basic = employee.basicSalary || 0;
  const perDay = basic / WORKING_DAYS;
  const hourlyRate = basic / (WORKING_DAYS * env.attendance.fullDayHours);

  const paidDays = presentDays + halfDays * 0.5 + leaveDays;
  const unpaidDays = Math.max(0, WORKING_DAYS - paidDays);

  const hra = round2(basic * 0.2);
  const overtimePay = round2(overtimeHours * hourlyRate * 1.5);
  const unpaidLeaveDeduction = round2(unpaidDays * perDay);
  const pf = round2(Math.min(basic * 0.12, 1800));
  const professionalTax = 200;

  const gross = round2(basic + hra + overtimePay);
  const incomeTax = gross > 50000 ? round2(gross * 0.05) : 0;

  const totalDeductions = round2(pf + professionalTax + incomeTax + unpaidLeaveDeduction);
  const netSalary = round2(gross - totalDeductions);

  return {
    basicSalary: basic,
    hra,
    bonus: 0,
    overtimePay,
    pf,
    professionalTax,
    incomeTax,
    otherDeductions: 0,
    unpaidLeaveDeduction,
    grossSalary: gross,
    totalDeductions,
    netSalary,
    meta: { presentDays, leaveDays, overtimeHours: round2(overtimeHours), workingDaysInMonth: WORKING_DAYS },
  };
}

// POST /api/payroll/generate { employeeId, month }  — HR/Finance
router.post(
  '/generate',
  requireRole('HR', 'FINANCE', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const { employeeId, month } = req.body || {};
    if (!employeeId || !/^\d{4}-\d{2}$/.test(month || '')) {
      throw ApiError.badRequest('employeeId and month (YYYY-MM) are required');
    }

    const employee = await Employee.findById(employeeId);
    if (!employee || employee.status === 'Archived') throw ApiError.notFound('Employee not found');

    const exists = await Payroll.findOne({ employee: employee._id, month });
    if (exists) throw ApiError.conflict(`Payroll for ${month} already generated`); // once per month

    const computed = await computePayroll(employee, month);
    const payroll = await Payroll.create({ employee: employee._id, month, ...computed });

    res.status(201).json({ success: true, payroll });
  })
);

// PATCH /api/payroll/:id/approve — Finance approval step from the workflow
router.patch(
  '/:id/approve',
  requireRole('FINANCE', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const payroll = await Payroll.findById(req.params.id).populate('employee', 'name');
    if (!payroll) throw ApiError.notFound('Payroll not found');
    if (payroll.status !== 'Draft') throw ApiError.conflict(`Already ${payroll.status.toLowerCase()}`);

    payroll.status = 'Approved';
    payroll.approvedBy = req.user.id;
    await payroll.save();

    const empUser = await User.findOne({ employee: payroll.employee._id });
    if (empUser) await notify(empUser._id, 'PAYSLIP_READY', `Your payslip for ${payroll.month} is ready.`);

    res.json({ success: true, payroll });
  })
);

// GET /api/payroll/me — own payslips (spec: employee sees own payroll)
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.user.employeeId) throw ApiError.badRequest('No employee profile linked');
    const payslips = await Payroll.find({ employee: req.user.employeeId, status: { $ne: 'Draft' } }).sort('-month');
    res.json({ success: true, payslips });
  })
);

// GET /api/payroll?month= — HR/Finance/Auditor full view (salary visible only to HR & Finance)
router.get(
  '/',
  requireRole('HR', 'FINANCE', 'ORG_ADMIN', 'AUDITOR'),
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.month) filter.month = req.query.month;
    const payrolls = await Payroll.find(filter)
      .populate('employee', 'employeeId name department')
      .sort('-month');
    res.json({ success: true, payrolls });
  })
);

module.exports = router;
