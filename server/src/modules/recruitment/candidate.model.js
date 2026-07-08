const mongoose = require('mongoose');

// Pipeline order matters — transitions must move forward (see routes).
const STAGES = [
  'Applied',
  'Screening',
  'Technical Interview',
  'HR Interview',
  'Offer',
  'Joined',
  'Rejected',
];

const candidateSchema = new mongoose.Schema(
  {
    candidateId: { type: String, unique: true }, // CAND0001
    candidateName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true }, // rule: candidate email unique
    position: { type: String, required: true },
    experience: { type: Number, min: 0, default: 0 },
    skills: [String],
    resumeText: String, // pasted / extracted resume content used for AI analysis
    resumeFile: String, // uploaded file name (rule: resume mandatory before screening)
    status: { type: String, enum: STAGES, default: 'Applied' },
    interviews: [
      {
        round: String, // Screening / Technical / HR
        scheduledAt: Date,
        interviewer: String,
        feedback: String,
        result: { type: String, enum: ['Pending', 'Pass', 'Fail'], default: 'Pending' },
      },
    ],
    aiAnalysis: {
      score: Number, // 0-100 fit score
      matchedSkills: [String],
      missingSkills: [String],
      summary: String,
      analyzedAt: Date,
    },
    hrApproved: { type: Boolean, default: false }, // rule: offer only after HR approval
  },
  { timestamps: true }
);

module.exports = mongoose.model('Candidate', candidateSchema);
module.exports.STAGES = STAGES;
