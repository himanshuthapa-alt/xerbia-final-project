const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { Project, Task } = require('./project.model');
const { User } = require('../auth/user.model');
const { notify } = require('../notifications/notification.service');

router.use(requireAuth);

// ---------- projects ----------

// GET /api/projects — everyone sees the project list; tasks are filtered per role below
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const projects = await Project.find()
      .populate('owner', 'employeeId name')
      .populate('members', 'employeeId name')
      .sort('-createdAt');
    res.json({ success: true, projects });
  })
);

// POST /api/projects — managers/team leads create (RBAC: Manager = CRUD)
router.post(
  '/',
  requireRole('MANAGER', 'TEAM_LEAD', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const { name, description, deadline, members } = req.body || {};
    if (!name) throw ApiError.badRequest('Project name is required');
    if (!deadline) throw ApiError.badRequest('Deadline mandatory');

    const project = await Project.create({
      name,
      description,
      deadline,
      owner: req.user.employeeId,
      members: Array.isArray(members) ? members : [],
      status: 'Active',
    });
    res.status(201).json({ success: true, project });
  })
);

// PATCH /api/projects/:id — status / members
router.patch(
  '/:id',
  requireRole('MANAGER', 'TEAM_LEAD', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) throw ApiError.notFound('Project not found');

    const { status, members, description, deadline } = req.body || {};

    if (status === 'Completed') {
      const open = await Task.countDocuments({ project: project._id, status: { $ne: 'Completed' } });
      if (open > 0) throw ApiError.conflict(`${open} task(s) still open`);
      // notification matrix: project completed → HR
      const hrUsers = await User.find({ role: 'HR', isActive: true }).select('_id');
      await Promise.all(hrUsers.map((u) => notify(u._id, 'PROJECT_COMPLETED', `Project "${project.name}" completed.`)));
    }

    if (status) project.status = status;
    if (members) project.members = members;
    if (description !== undefined) project.description = description;
    if (deadline) project.deadline = deadline;
    await project.save();

    res.json({ success: true, project });
  })
);

// ---------- tasks ----------

// GET /api/projects/:id/tasks
router.get(
  '/:id/tasks',
  asyncHandler(async (req, res) => {
    const filter = { project: req.params.id };
    // Employees only see their own tasks (RBAC: Employee = assigned tasks)
    if (req.user.role === 'EMPLOYEE') filter.assignedTo = req.user.employeeId;

    const tasks = await Task.find(filter).populate('assignedTo', 'employeeId name').sort('deadline');
    res.json({ success: true, tasks });
  })
);

// POST /api/projects/:id/tasks
router.post(
  '/:id/tasks',
  requireRole('MANAGER', 'TEAM_LEAD', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const { title, assignedTo, priority, deadline } = req.body || {};
    if (!title || !assignedTo) throw ApiError.badRequest('title and assignedTo are required');
    if (!deadline) throw ApiError.badRequest('Deadline mandatory');

    const project = await Project.findById(req.params.id);
    if (!project) throw ApiError.notFound('Project not found');
    if (project.status === 'Completed') throw ApiError.conflict('Project is completed (read-only)');

    const task = await Task.create({ project: project._id, title, assignedTo, priority, deadline });

    const assigneeUser = await User.findOne({ employee: assignedTo });
    if (assigneeUser) await notify(assigneeUser._id, 'TASK_ASSIGNED', `New task: "${title}" (due ${deadline})`);

    res.status(201).json({ success: true, task });
  })
);

// PATCH /api/projects/tasks/:taskId — status transitions
router.patch(
  '/tasks/:taskId',
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.taskId).populate('project', 'owner name');
    if (!task) throw ApiError.notFound('Task not found');

    // Rule: completed tasks become read-only
    if (task.status === 'Completed') throw ApiError.conflict('Completed tasks are read-only');

    const { status } = req.body || {};
    if (!status) throw ApiError.badRequest('status is required');

    const isAssignee = String(task.assignedTo) === String(req.user.employeeId);
    const isManagerRole = ['MANAGER', 'TEAM_LEAD', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    if (!isAssignee && !isManagerRole) throw ApiError.forbidden('Not your task');

    // Rule: task cannot be completed without review — and only a manager closes it
    if (status === 'Completed') {
      if (task.status !== 'Review') throw ApiError.conflict('Task must pass Review before completion');
      if (!isManagerRole) throw ApiError.forbidden('Only a manager can complete a task');
      // notification matrix: task completed → manager (project owner)
      const ownerUser = await User.findOne({ employee: task.project?.owner });
      if (ownerUser) await notify(ownerUser._id, 'TASK_COMPLETED', `Task "${task.title}" completed.`);
    }

    task.status = status;
    await task.save();
    res.json({ success: true, task });
  })
);

module.exports = router;
