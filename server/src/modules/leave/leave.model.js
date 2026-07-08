const mongoose = require('mongoose');

// Spec: Casual 12 / Sick 10 / Earned 15; maternity & paternity by org policy; WFH by approval
const LEAVE_TYPES = {
  'Casual Leave': 12,
  'Sick Leave': 10,
  'Earned Leave': 15,
  'Maternity Leave': 26,
  'Paternity Leave': 5,
  'Work From Home': 24,
};

const leaveSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveType: { type: String, enum: Object.keys(LEAVE_TYPES), required: true },
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, required: true },
    days: { type: Number, required: true, min: 0.5 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
  },
  { timestamps: true }
);

leaveSchema.index({ employee: 1, status: 1 });

// One balance doc per employee per year.
const leaveBalanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    year: { type: Number, required: true },
    balances: { type: Map, of: Number, default: () => new Map(Object.entries(LEAVE_TYPES)) },
  },
  { timestamps: true }
);
leaveBalanceSchema.index({ employee: 1, year: 1 }, { unique: true });

const Leave = mongoose.model('Leave', leaveSchema);
const LeaveBalance = mongoose.model('LeaveBalance', leaveBalanceSchema);

module.exports = { Leave, LeaveBalance, LEAVE_TYPES };
