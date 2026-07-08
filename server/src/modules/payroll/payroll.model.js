const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    month: { type: String, required: true }, // "YYYY-MM"

    // components (see computePayroll for the formulas)
    basicSalary: { type: Number, required: true },
    hra: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    overtimePay: { type: Number, default: 0 },
    pf: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    incomeTax: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 },
    unpaidLeaveDeduction: { type: Number, default: 0 },

    grossSalary: { type: Number, required: true },
    totalDeductions: { type: Number, required: true },
    netSalary: { type: Number, required: true },

    meta: {
      presentDays: Number,
      leaveDays: Number,
      overtimeHours: Number,
      workingDaysInMonth: Number,
    },

    status: { type: String, enum: ['Draft', 'Approved', 'Paid'], default: 'Draft' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Rule: payroll generated once per month per employee
payrollSchema.index({ employee: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Payroll', payrollSchema);
