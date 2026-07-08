/* Organization module — departments, designations, holidays.
   Kept small on purpose: handlers live next to routes since none of
   them is more than a few lines. Split into a controller if it grows. */
const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { requireAuth, requireRole } = require('../../middleware/auth');
const Department = require('./department.model');
const Employee = require('../employees/employee.model');

router.use(requireAuth);

// GET /api/org/departments — everyone can read the org chart
router.get(
  '/departments',
  asyncHandler(async (_req, res) => {
    const departments = await Department.find({ status: 'Active' })
      .populate('manager', 'employeeId name')
      .populate('parent', 'name code')
      .sort('name');
    res.json({ success: true, departments });
  })
);

// POST /api/org/departments
router.post(
  '/departments',
  requireRole('HR', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const { name, code, manager, parent } = req.body || {};
    if (!name) throw ApiError.badRequest('Department Name Required');
    if (!code) throw ApiError.badRequest('Department Code Required');
    const dep = await Department.create({ name, code, manager, parent: parent || null });
    res.status(201).json({ success: true, department: dep });
  })
);

// PATCH /api/org/departments/:id
router.patch(
  '/departments/:id',
  requireRole('HR', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const { name, manager, parent, status } = req.body || {};
    const dep = await Department.findById(req.params.id);
    if (!dep) throw ApiError.notFound('Department not found');

    // Rule: department cannot be archived/deleted while employees exist in it
    if (status === 'Archived') {
      const count = await Employee.countDocuments({ department: dep._id, status: { $ne: 'Archived' } });
      if (count > 0) throw ApiError.conflict(`Department has ${count} active employee(s)`);
    }

    Object.assign(dep, {
      ...(name !== undefined && { name }),
      ...(manager !== undefined && { manager }),
      ...(parent !== undefined && { parent }),
      ...(status !== undefined && { status }),
    });
    await dep.save();
    res.json({ success: true, department: dep });
  })
);

module.exports = router;
