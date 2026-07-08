const mongoose = require('mongoose');

const STATUSES = ['Present', 'Absent', 'Late', 'Half Day', 'Leave', 'Holiday', 'Work From Home'];

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD (string keeps tz headaches away)
    clockIn: String,   // "09:02"
    clockOut: String,  // "18:15"
    workingHours: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    status: { type: String, enum: STATUSES, default: 'Present' },
    location: {
      lat: Number,
      lng: Number,
    },
    correction: {
      requested: { type: Boolean, default: false },
      reason: String,
      requestedClockIn: String,
      requestedClockOut: String,
      state: { type: String, enum: ['None', 'Pending', 'Approved', 'Rejected'], default: 'None' },
    },
  },
  { timestamps: true }
);

// ATT-01: one attendance record per employee per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
module.exports.STATUSES = STATUSES;
