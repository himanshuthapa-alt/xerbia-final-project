const { generate, AIUnavailableError } = require('./gemini.client');
const ApiError = require('../../utils/ApiError');
const Employee = require('../employees/employee.model');
const Attendance = require('../attendance/attendance.model');
const { Leave, LeaveBalance, LEAVE_TYPES } = require('../leave/leave.model');
const Payroll = require('../payroll/payroll.model');

/**
 * Builds the per-user context block injected into the assistant prompt.
 * The assistant only ever sees data the requesting user is allowed to see:
 *  - own employee profile, leave balance, recent attendance
 *  - own latest payslip ONLY (salary stays invisible to others by construction)
 */
async function buildUserContext(user) {
  const lines = [`User role: ${user.role}`];
  if (!user.employeeId) return lines.join('\n');

  const emp = await Employee.findById(user.employeeId).populate('department', 'name');
  if (!emp) return lines.join('\n');

  lines.push(
    `Employee: ${emp.name} (${emp.employeeId}), ${emp.designation}, dept ${emp.department?.name || '-'}, joined ${emp.joiningDate?.toISOString().slice(0, 10)}`
  );

  const year = new Date().getFullYear();
  const bal = await LeaveBalance.findOne({ employee: emp._id, year });
  if (bal) {
    const parts = [];
    for (const [type, remaining] of bal.balances) {
      parts.push(`${type}: ${remaining}/${LEAVE_TYPES[type] ?? '?'} remaining`);
    }
    lines.push(`Leave balances (${year}): ${parts.join('; ')}`);
  }

  const pendingLeaves = await Leave.countDocuments({ employee: emp._id, status: 'Pending' });
  if (pendingLeaves) lines.push(`Pending leave requests: ${pendingLeaves}`);

  const month = new Date().toISOString().slice(0, 7);
  const attendance = await Attendance.find({ employee: emp._id, date: { $regex: `^${month}` } });
  if (attendance.length) {
    const present = attendance.filter((a) => ['Present', 'Late', 'Work From Home'].includes(a.status)).length;
    const late = attendance.filter((a) => a.status === 'Late').length;
    const hours = attendance.reduce((s, a) => s + (a.workingHours || 0), 0);
    lines.push(
      `Attendance this month: ${present} day(s) marked, ${late} late arrival(s), ${hours.toFixed(1)}h total`
    );
  }

  const payslip = await Payroll.findOne({ employee: emp._id, status: { $ne: 'Draft' } }).sort('-month');
  if (payslip) {
    lines.push(
      `Latest payslip (${payslip.month}): basic ${payslip.basicSalary}, HRA ${payslip.hra}, overtime ${payslip.overtimePay}, deductions ${payslip.totalDeductions}, NET ${payslip.netSalary}`
    );
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You are the AI Operations Assistant inside an Enterprise Workforce Management Platform.',
  'You help with: HR policy questions, leave guidance, attendance insights, payroll explanations, and workforce questions.',
  'Company policy quick facts: casual leave 12/yr, sick 10/yr, earned 15/yr; office starts 09:30; full day = 9h; overtime paid at 1.5x after 9h; account locks after 5 failed logins.',
  'Ground every answer in the CONTEXT block when relevant. If the context lacks the answer, say so and suggest who to contact (HR for policy, Finance for payroll, IT for access).',
  'Never invent numbers. Never reveal other employees\' salary or personal data.',
  'Keep answers short and practical — 1 to 4 sentences unless asked for detail.',
].join(' ');

/** POST /api/ai/chat { message } */
async function chat(req, res) {
  const message = String(req.body?.message || '').trim();
  if (!message) throw ApiError.badRequest('message is required');
  if (message.length > 2000) throw ApiError.badRequest('message too long (2000 chars max)');

  const context = await buildUserContext(req.user);

  try {
    const reply = await generate(`CONTEXT:\n${context}\n\nQUESTION:\n${message}`, {
      system: SYSTEM_PROMPT,
    });
    return res.json({ success: true, reply, source: 'gemini' });
  } catch (err) {
    if (!(err instanceof AIUnavailableError)) throw err;

    // Graceful degradation: answer leave-balance questions from the DB directly.
    if (/leave/i.test(message) && /balance|remaining|left|how many/i.test(message) && req.user.employeeId) {
      const bal = await LeaveBalance.findOne({
        employee: req.user.employeeId,
        year: new Date().getFullYear(),
      });
      if (bal) {
        const parts = [...bal.balances].map(([t, r]) => `${t}: ${r} left`).join(', ');
        return res.json({
          success: true,
          reply: `(AI offline — from records) Your current balances: ${parts}.`,
          source: 'fallback',
        });
      }
    }
    return res.status(502).json({ success: false, message: err.message, source: 'fallback' });
  }
}

/** POST /api/ai/payroll-explain { month? } — Payroll Explainer feature */
async function payrollExplain(req, res) {
  if (!req.user.employeeId) throw ApiError.badRequest('No employee profile linked');

  const filter = { employee: req.user.employeeId, status: { $ne: 'Draft' } };
  if (req.body?.month) filter.month = req.body.month;
  const slip = await Payroll.findOne(filter).sort('-month');
  if (!slip) throw ApiError.notFound('No payslip found');

  const reply = await generate(
    [
      'Explain this payslip to the employee in plain language, line by line, then one sentence on the net amount.',
      JSON.stringify({
        month: slip.month,
        basic: slip.basicSalary,
        hra: slip.hra,
        bonus: slip.bonus,
        overtimePay: slip.overtimePay,
        pf: slip.pf,
        professionalTax: slip.professionalTax,
        incomeTax: slip.incomeTax,
        unpaidLeaveDeduction: slip.unpaidLeaveDeduction,
        gross: slip.grossSalary,
        totalDeductions: slip.totalDeductions,
        net: slip.netSalary,
        presentDays: slip.meta?.presentDays,
      }),
    ].join('\n'),
    { system: SYSTEM_PROMPT }
  );

  res.json({ success: true, month: slip.month, reply });
}

/** POST /api/ai/summarize { text } — Meeting-notes / document summarizer */
async function summarize(req, res) {
  const text = String(req.body?.text || '').trim();
  if (!text) throw ApiError.badRequest('text is required');
  if (text.length > 20000) throw ApiError.badRequest('text too long (20k chars max)');

  const reply = await generate(
    `Summarize the following into concise bullet points (max 8 bullets), then a one-line action-items list:\n\n"""${text}"""`,
    { system: 'You summarize workplace documents and meeting notes. Be faithful to the source; do not add facts.' }
  );

  res.json({ success: true, summary: reply });
}

module.exports = { chat, payrollExplain, summarize };
