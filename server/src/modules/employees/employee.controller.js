const Employee = require('./employee.model');
const Department = require('../org/department.model');
const { User } = require('../auth/user.model');
const { nextId } = require('../../utils/sequence');
const { notify } = require('../notifications/notification.service');
const ApiError = require('../../utils/ApiError');

/**
 * POST /api/employees  — HR/Admin only (BR-05: only HR/Admin create accounts)
 * Creates the employee profile + a login account, auto-generates EMP id.
 */
async function createEmployee(req, res) {
  const {
    name, email, mobile, address, gender, bloodGroup, dob,
    department, designation, joiningDate, manager,
    employmentType, salaryGrade, basicSalary, password,
  } = req.body || {};

  if (!name || !email || !department || !designation || !joiningDate) {
    throw ApiError.badRequest('name, email, department, designation and joiningDate are required');
  }

  const dep = await Department.findById(department);
  if (!dep || dep.status !== 'Active') throw ApiError.badRequest('Invalid department');

  if (manager) {
    const mgr = await Employee.findById(manager);
    if (!mgr) throw ApiError.badRequest('Reporting manager not found');
  }

  const employeeId = await nextId('employee', 'EMP');
  const employee = await Employee.create({
    employeeId, name, email, mobile, address, gender, bloodGroup, dob,
    department, designation, joiningDate, manager,
    employmentType, salaryGrade, basicSalary,
    status: 'Probation',
  });

  // Create the login (HR creates accounts before first login — assumption in spec)
  const initialPassword = password || 'Welcome@123';
  const user = await User.create({
    name,
    email,
    mobile,
    passwordHash: await User.hashPassword(initialPassword),
    role: 'EMPLOYEE',
    employee: employee._id,
  });

  await notify(user._id, 'EMPLOYEE_CREATED', `Welcome aboard, ${name}! Your employee ID is ${employeeId}.`);

  res.status(201).json({
    success: true,
    employee: employee.toSafeJSON(req.user.role),
    login: { email: user.email, initialPassword: password ? undefined : initialPassword },
  });
}

/**
 * GET /api/employees?search=&department=&status=&page=&limit=
 * Paginated list. Salary stripped for non HR/Finance.
 */
async function listEmployees(req, res) {
  const { search, department, status } = req.query;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));

  const filter = {};
  if (search) filter.$or = [
    { name: { $regex: search, $options: 'i' } },
    { employeeId: { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
  ];
  if (department) filter.department = department;
  filter.status = status || { $ne: 'Archived' };

  const [items, total] = await Promise.all([
    Employee.find(filter)
      .populate('department', 'name code')
      .populate('manager', 'employeeId name')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Employee.countDocuments(filter),
  ]);

  res.json({
    success: true,
    employees: items.map((e) => e.toSafeJSON(req.user.role)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * GET /api/employees/:id — employees may view themselves; managers/HR anyone.
 */
async function getEmployee(req, res) {
  const employee = await Employee.findById(req.params.id)
    .populate('department', 'name code')
    .populate('manager', 'employeeId name designation');
  if (!employee) throw ApiError.notFound('Employee not found');

  const isSelf = req.user.employeeId && req.user.employeeId === employee._id.toString();
  const canReadOthers = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR', 'MANAGER', 'TEAM_LEAD', 'FINANCE', 'AUDITOR'];
  if (!isSelf && !canReadOthers.includes(req.user.role)) {
    throw ApiError.forbidden('You can only view your own profile'); // IDOR guard
  }

  res.json({ success: true, employee: employee.toSafeJSON(req.user.role) });
}

/**
 * PATCH /api/employees/:id — HR/Admin
 */
async function updateEmployee(req, res) {
  const employee = await Employee.findById(req.params.id);
  if (!employee) throw ApiError.notFound('Employee not found');

  const updatable = [
    'name', 'mobile', 'address', 'gender', 'bloodGroup', 'dob',
    'department', 'designation', 'manager', 'employmentType',
    'salaryGrade', 'basicSalary', 'status',
  ];
  const changedManager = req.body.manager && String(req.body.manager) !== String(employee.manager || '');
  const changedSalary = req.body.basicSalary !== undefined && req.body.basicSalary !== employee.basicSalary;

  for (const key of updatable) {
    if (req.body[key] !== undefined) employee[key] = req.body[key];
  }
  await employee.save();

  // spec notification matrix: manager changed → employee, salary updated → finance
  const linkedUser = await User.findOne({ employee: employee._id });
  if (changedManager && linkedUser) {
    await notify(linkedUser._id, 'MANAGER_CHANGED', 'Your reporting manager has been updated.');
  }
  if (changedSalary) {
    const financeUsers = await User.find({ role: 'FINANCE', isActive: true }).select('_id');
    await Promise.all(
      financeUsers.map((u) =>
        notify(u._id, 'SALARY_UPDATED', `Salary updated for ${employee.employeeId} (${employee.name}).`)
      )
    );
  }

  res.json({ success: true, employee: employee.toSafeJSON(req.user.role) });
}

/**
 * DELETE /api/employees/:id — soft delete (rule: deleted employees archived)
 */
async function archiveEmployee(req, res) {
  const employee = await Employee.findById(req.params.id);
  if (!employee) throw ApiError.notFound('Employee not found');

  employee.status = 'Archived';
  await employee.save();
  await User.updateOne({ employee: employee._id }, { isActive: false });

  res.json({ success: true, message: `${employee.employeeId} archived` });
}

/**
 * POST /api/employees/:id/documents — multipart upload (Aadhaar/PAN/Resume/...)
 */
async function uploadDocument(req, res) {
  const employee = await Employee.findById(req.params.id);
  if (!employee) throw ApiError.notFound('Employee not found');
  if (!req.file) throw ApiError.badRequest('No file uploaded');

  employee.documents.push({
    label: req.body.label || 'Document',
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
  await employee.save();

  res.status(201).json({ success: true, documents: employee.documents });
}

module.exports = {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  archiveEmployee,
  uploadDocument,
};
