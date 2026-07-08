/**
 * Demo data seeder. Run with:  npm run seed
 * Creates departments, one login per role, employees, attendance,
 * leave balances, a candidate and a project. Idempotent-ish: it
 * WIPES the listed collections first — dev use only.
 */
const mongoose = require('mongoose');
const env = require('../config/env');
const { User } = require('../modules/auth/user.model');
const Employee = require('../modules/employees/employee.model');
const Department = require('../modules/org/department.model');
const Attendance = require('../modules/attendance/attendance.model');
const { Leave, LeaveBalance } = require('../modules/leave/leave.model');
const Candidate = require('../modules/recruitment/candidate.model');
const { Project, Task } = require('../modules/projects/project.model');
const Notification = require('../modules/notifications/notification.model');
const Payroll = require('../modules/payroll/payroll.model');
const { nextId } = require('../utils/sequence');

const PASSWORD = 'Secure@123'; // meets BR-02/BR-03

async function run() {
  await mongoose.connect(env.mongoUri);
  console.log('[seed] connected to', mongoose.connection.name);

  await Promise.all([
    User.deleteMany({}), Employee.deleteMany({}), Department.deleteMany({}),
    Attendance.deleteMany({}), Leave.deleteMany({}), LeaveBalance.deleteMany({}),
    Candidate.deleteMany({}), Project.deleteMany({}), Task.deleteMany({}),
    Notification.deleteMany({}), Payroll.deleteMany({}),
    mongoose.connection.collection('counters').deleteMany({}),
  ]);
  console.log('[seed] cleared collections');

  const passwordHash = await User.hashPassword(PASSWORD);

  // --- departments ---
  const [eng, hr, fin, mkt] = await Department.create([
    { name: 'Engineering', code: 'ENG' },
    { name: 'HR', code: 'HR' },
    { name: 'Finance', code: 'FIN' },
    { name: 'Marketing', code: 'MKT' },
  ]);

  // --- employees + users, wired into a reporting chain ---
  async function addPerson({ name, email, role, department, designation, manager, basicSalary }) {
    const employee = await Employee.create({
      employeeId: await nextId('employee', 'EMP'),
      name,
      email,
      department,
      designation,
      manager,
      joiningDate: new Date('2025-01-15'),
      basicSalary,
      status: 'Active',
      mobile: '9876543210',
    });
    const user = await User.create({ name, email, role, passwordHash, employee: employee._id });
    await LeaveBalance.create({ employee: employee._id, year: new Date().getFullYear() });
    return { employee, user };
  }

  const admin = await addPerson({
    name: 'Sita Verma', email: 'admin@company.com', role: 'ORG_ADMIN',
    department: hr._id, designation: 'Organization Admin', basicSalary: 120000,
  });
  const hrManager = await addPerson({
    name: 'Amit Kulkarni', email: 'hr@company.com', role: 'HR',
    department: hr._id, designation: 'HR Manager', basicSalary: 80000,
  });
  const finance = await addPerson({
    name: 'Neha Gupta', email: 'finance@company.com', role: 'FINANCE',
    department: fin._id, designation: 'Finance Executive', basicSalary: 75000,
  });
  const manager = await addPerson({
    name: 'Rajesh Iyer', email: 'manager@company.com', role: 'MANAGER',
    department: eng._id, designation: 'Engineering Manager', basicSalary: 110000,
  });
  const employee = await addPerson({
    name: 'Rahul Sharma', email: 'employee@company.com', role: 'EMPLOYEE',
    department: eng._id, designation: 'Software Engineer',
    manager: manager.employee._id, basicSalary: 60000,
  });
  const employee2 = await addPerson({
    name: 'Priya Nair', email: 'priya@company.com', role: 'EMPLOYEE',
    department: eng._id, designation: 'QA Engineer',
    manager: manager.employee._id, basicSalary: 55000,
  });
  await addPerson({
    name: 'Vikram Singh', email: 'it@company.com', role: 'IT_ADMIN',
    department: eng._id, designation: 'IT Administrator', basicSalary: 70000,
  });
  await addPerson({
    name: 'Anita Rao', email: 'auditor@company.com', role: 'AUDITOR',
    department: fin._id, designation: 'Auditor', basicSalary: 65000,
  });

  // Super admin has no employee profile — pure platform account.
  await User.create({
    name: 'Platform Root', email: 'root@company.com', role: 'SUPER_ADMIN', passwordHash,
  });

  // department managers
  eng.manager = manager.employee._id; await eng.save();
  hr.manager = hrManager.employee._id; await hr.save();
  fin.manager = finance.employee._id; await fin.save();
  mkt.manager = admin.employee._id; await mkt.save();

  // --- last month's attendance for Rahul & Priya so payroll works out of the box ---
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Build the YYYY-MM label from LOCAL parts — toISOString() would shift midnight
  // back a day in +tz zones (e.g. IST) and land us in the wrong month.
  const ym = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate();

  const attendanceDocs = [];
  for (const emp of [employee.employee, employee2.employee]) {
    let workdays = 0;
    for (let d = 1; d <= daysInMonth && workdays < 22; d++) {
      const date = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), d);
      if (date.getDay() === 0 || date.getDay() === 6) continue; // skip weekends
      workdays++;
      const late = workdays % 7 === 0; // one late day a week, roughly
      attendanceDocs.push({
        employee: emp._id,
        date: `${ym}-${String(d).padStart(2, '0')}`,
        clockIn: late ? '10:05' : '09:12',
        clockOut: workdays % 5 === 0 ? '19:45' : '18:20',
        workingHours: workdays % 5 === 0 ? 9.67 : 9.13,
        overtime: workdays % 5 === 0 ? 0.67 : 0.13,
        status: late ? 'Late' : 'Present',
      });
    }
  }
  await Attendance.insertMany(attendanceDocs);

  // --- a pending leave request for the manager to act on ---
  const in3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const in4 = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  await Leave.create({
    employee: employee.employee._id,
    leaveType: 'Casual Leave',
    startDate: in3,
    endDate: in4,
    days: 2,
    reason: 'Family function',
  });

  // --- recruitment sample ---
  await Candidate.create({
    candidateId: await nextId('candidate', 'CAND'),
    candidateName: 'Priya Singh',
    email: 'priya.singh@gmail.com',
    position: 'Full Stack Developer',
    experience: 2,
    skills: ['React', 'NodeJS', 'MongoDB'],
    status: 'Screening',
    resumeText:
      'Priya Singh — Full Stack Developer with 2 years of experience building MERN applications. ' +
      'Skills: React, Redux, Node.js, Express, MongoDB, REST APIs, Git. ' +
      'Built an employee portal serving 500+ users; reduced page load by 40%. B.Tech CSE, 2023.',
  });

  // --- project + tasks ---
  const project = await Project.create({
    name: 'Employee Portal',
    description: 'Internal self-service portal',
    owner: manager.employee._id,
    members: [employee.employee._id, employee2.employee._id],
    deadline: '2026-08-15',
    status: 'Active',
  });
  await Task.create([
    { project: project._id, title: 'Build Attendance Module', assignedTo: employee.employee._id, priority: 'High', status: 'In Progress', deadline: '2026-08-15' },
    { project: project._id, title: 'Write E2E tests', assignedTo: employee2.employee._id, priority: 'Medium', status: 'To Do', deadline: '2026-08-10' },
  ]);

  console.log('\n[seed] done. Logins (all passwords = %s):', PASSWORD);
  console.table([
    { email: 'root@company.com', role: 'SUPER_ADMIN' },
    { email: 'admin@company.com', role: 'ORG_ADMIN' },
    { email: 'hr@company.com', role: 'HR' },
    { email: 'finance@company.com', role: 'FINANCE' },
    { email: 'manager@company.com', role: 'MANAGER' },
    { email: 'employee@company.com', role: 'EMPLOYEE' },
    { email: 'priya@company.com', role: 'EMPLOYEE' },
    { email: 'it@company.com', role: 'IT_ADMIN' },
    { email: 'auditor@company.com', role: 'AUDITOR' },
  ]);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
