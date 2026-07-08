const mongoose = require('mongoose');

const SALARY_VISIBLE_ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR', 'FINANCE'];

const documentSchema = new mongoose.Schema(
  {
    label: { type: String, required: true }, // Aadhaar / PAN / Resume / Offer Letter / Certificate / Photo
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, unique: true, index: true }, // auto: EMP0001 (rule: auto generated)

    // personal
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true }, // rule: email unique
    mobile: { type: String, match: [/^\d{10}$/, 'Mobile must be a valid 10 digit number'] },
    address: String,
    gender: { type: String, enum: ['Male', 'Female', 'Other', undefined] },
    bloodGroup: String,
    dob: Date,

    // professional
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    designation: { type: String, required: true },
    joiningDate: {
      type: Date,
      required: true,
      validate: {
        validator: (v) => v <= new Date(), // rule: joining date cannot exceed current date
        message: 'Joining Date cannot exceed current date',
      },
    },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, // one reporting manager
    employmentType: {
      type: String,
      enum: ['Full-Time', 'Part-Time', 'Contract', 'Intern'],
      default: 'Full-Time',
    },
    salaryGrade: { type: String, default: 'G1' },
    basicSalary: { type: Number, min: [0, 'Salary must be a positive number'], default: 0 },

    status: {
      type: String,
      enum: ['Active', 'Probation', 'On Leave', 'Resigned', 'Archived'],
      default: 'Probation',
    },

    documents: [documentSchema],
  },
  { timestamps: true }
);

employeeSchema.index({ name: 'text' });

/** Field-level security: salary is visible only to HR & Finance (and admins). */
employeeSchema.methods.toSafeJSON = function (role) {
  const obj = this.toObject({ virtuals: false });
  if (!SALARY_VISIBLE_ROLES.includes(role)) {
    delete obj.basicSalary;
    delete obj.salaryGrade;
  }
  return obj;
};

const Employee = mongoose.model('Employee', employeeSchema);
module.exports = Employee;
module.exports.SALARY_VISIBLE_ROLES = SALARY_VISIBLE_ROLES;
