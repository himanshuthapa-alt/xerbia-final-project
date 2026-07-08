const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = [
  'SUPER_ADMIN',
  'ORG_ADMIN',
  'HR',
  'MANAGER',
  'TEAM_LEAD',
  'EMPLOYEE',
  'FINANCE',
  'IT_ADMIN',
  'AUDITOR',
];

// BR-02 / BR-03: min 8 chars, upper + lower + number + special
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const loginHistorySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    ip: String,
    userAgent: String,
    success: Boolean,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true, // BR-01
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'EMPLOYEE' },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    mobile: { type: String, match: [/^\d{10}$/, 'Mobile must be 10 digits'] },
    isActive: { type: Boolean, default: true },

    // BR-04: lock after 5 failed attempts
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },

    loginHistory: { type: [loginHistorySchema], select: false },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > new Date();
};

userSchema.statics.hashPassword = async function (plain) {
  if (!PASSWORD_RULE.test(plain)) {
    const err = new Error(
      'Password must be 8+ chars with uppercase, lowercase, number and special character'
    );
    err.statusCode = 400;
    err.isOperational = true;
    throw err;
  }
  return bcrypt.hash(plain, 10);
};

const User = mongoose.model('User', userSchema);

module.exports = { User, ROLES, PASSWORD_RULE };
