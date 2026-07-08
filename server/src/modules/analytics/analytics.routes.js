// Reports & Analytics — dashboard aggregates. Read-only by design.
const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const { requireAuth } = require('../../middleware/auth');
const Employee = require('../employees/employee.model');
const Attendance = require('../attendance/attendance.model');
const { Leave } = require('../leave/leave.model');
const Candidate = require('../recruitment/candidate.model');
const { Project, Task } = require('../projects/project.model');
const Payroll = require('../payroll/payroll.model');

router.use(requireAuth);

// GET /api/analytics/summary — role-aware dashboard numbers
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    const [
      totalEmployees,
      byDepartment,
      presentToday,
      pendingLeaves,
      openTasks,
      activeProjects,
      candidateFunnel,
    ] = await Promise.all([
      Employee.countDocuments({ status: { $ne: 'Archived' } }),
      Employee.aggregate([
        { $match: { status: { $ne: 'Archived' } } },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dep' } },
        { $project: { name: { $arrayElemAt: ['$dep.name', 0] }, count: 1 } },
      ]),
      Attendance.countDocuments({ date: today, status: { $in: ['Present', 'Late', 'Work From Home'] } }),
      Leave.countDocuments({ status: 'Pending' }),
      Task.countDocuments({ status: { $nin: ['Completed'] } }),
      Project.countDocuments({ status: 'Active' }),
      Candidate.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    const summary = {
      totalEmployees,
      byDepartment: byDepartment.map((d) => ({ department: d.name || 'Unknown', count: d.count })),
      presentToday,
      pendingLeaves,
      openTasks,
      activeProjects,
      recruitment: Object.fromEntries(candidateFunnel.map((c) => [c._id, c.count])),
    };

    // Payroll totals only for roles allowed to see money (RBAC matrix)
    if (['HR', 'FINANCE', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      const payrollAgg = await Payroll.aggregate([
        { $match: { month } },
        { $group: { _id: null, total: { $sum: '$netSalary' }, count: { $sum: 1 } } },
      ]);
      summary.payrollThisMonth = payrollAgg[0] ? { totalNet: payrollAgg[0].total, slips: payrollAgg[0].count } : { totalNet: 0, slips: 0 };
    }

    res.json({ success: true, summary });
  })
);

module.exports = router;
