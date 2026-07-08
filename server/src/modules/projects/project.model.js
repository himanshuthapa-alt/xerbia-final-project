const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: String,
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
    deadline: { type: String, required: [true, 'Deadline mandatory'] }, // YYYY-MM-DD
    status: { type: String, enum: ['Planned', 'Active', 'Completed'], default: 'Planned' },
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, trim: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true }, // one owner per task
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    status: {
      type: String,
      enum: ['To Do', 'In Progress', 'Review', 'Completed', 'Blocked'],
      default: 'To Do',
    },
    deadline: { type: String, required: [true, 'Deadline mandatory'] },
  },
  { timestamps: true }
);

taskSchema.index({ project: 1, status: 1 });

const Project = mongoose.model('Project', projectSchema);
const Task = mongoose.model('Task', taskSchema);

module.exports = { Project, Task };
