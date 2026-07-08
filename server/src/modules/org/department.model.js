const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Department Name Required'], trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true }, // Department Code Unique
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, // One Department Manager
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null }, // hierarchy
    status: { type: String, enum: ['Active', 'Archived'], default: 'Active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Department', departmentSchema);
