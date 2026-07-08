const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { requireAuth, requireRole } = require('../../middleware/auth');
const Candidate = require('./candidate.model');
const { STAGES } = require('./candidate.model');
const { nextId } = require('../../utils/sequence');
const { analyzeResume } = require('../ai/gemini.client');

router.use(requireAuth);
// Recruitment: HR full CRUD, managers interview-only visibility (RBAC matrix)
router.use(requireRole('HR', 'ORG_ADMIN', 'MANAGER'));

// POST /api/recruitment/candidates
router.post(
  '/candidates',
  requireRole('HR', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const { candidateName, email, position, experience, skills, resumeText } = req.body || {};
    if (!candidateName || !email || !position) {
      throw ApiError.badRequest('candidateName, email and position are required');
    }

    const candidateId = await nextId('candidate', 'CAND');
    const candidate = await Candidate.create({
      candidateId,
      candidateName,
      email,
      position,
      experience: experience || 0,
      skills: Array.isArray(skills) ? skills : [],
      resumeText: resumeText || '',
    });

    res.status(201).json({ success: true, candidate });
  })
);

// GET /api/recruitment/candidates?status=
router.get(
  '/candidates',
  asyncHandler(async (req, res) => {
    const filter = req.query.status ? { status: req.query.status } : {};
    const candidates = await Candidate.find(filter).sort('-createdAt');
    res.json({ success: true, candidates });
  })
);

// GET /api/recruitment/dashboard — funnel counts (Applied/Interview/Offer/Joined/Rejected)
router.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const byStage = await Candidate.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const counts = Object.fromEntries(byStage.map((s) => [s._id, s.count]));
    res.json({
      success: true,
      funnel: {
        applied: counts['Applied'] || 0,
        screening: counts['Screening'] || 0,
        interview: (counts['Technical Interview'] || 0) + (counts['HR Interview'] || 0),
        offer: counts['Offer'] || 0,
        joined: counts['Joined'] || 0,
        rejected: counts['Rejected'] || 0,
      },
    });
  })
);

// POST /api/recruitment/candidates/:id/analyze — AI resume analysis (spec §AI Resume Analysis)
router.post(
  '/candidates/:id/analyze',
  asyncHandler(async (req, res) => {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) throw ApiError.notFound('Candidate not found');
    if (!candidate.resumeText) {
      throw ApiError.badRequest('Candidate has no resume text to analyze. Add resumeText first.');
    }

    const requiredSkills = req.body?.requiredSkills || ['React', 'Node.js', 'MongoDB', 'Express'];
    const analysis = await analyzeResume(candidate.resumeText, candidate.position, requiredSkills);

    candidate.aiAnalysis = { ...analysis, analyzedAt: new Date() };
    await candidate.save();

    res.json({ success: true, aiAnalysis: candidate.aiAnalysis });
  })
);

// POST /api/recruitment/candidates/:id/interviews — schedule a round
router.post(
  '/candidates/:id/interviews',
  asyncHandler(async (req, res) => {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) throw ApiError.notFound('Candidate not found');

    // Rule: interview cannot be scheduled without screening
    if (candidate.status === 'Applied') {
      throw ApiError.conflict('Move the candidate to Screening before scheduling interviews');
    }

    const { round, scheduledAt, interviewer } = req.body || {};
    if (!round || !scheduledAt) throw ApiError.badRequest('round and scheduledAt are required');

    candidate.interviews.push({ round, scheduledAt, interviewer });
    await candidate.save();
    res.status(201).json({ success: true, candidate });
  })
);

// PATCH /api/recruitment/candidates/:id/status { status }
router.patch(
  '/candidates/:id/status',
  requireRole('HR', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const { status, hrApproved } = req.body || {};
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) throw ApiError.notFound('Candidate not found');

    if (hrApproved !== undefined) candidate.hrApproved = hrApproved;

    if (status) {
      if (!STAGES.includes(status)) throw ApiError.badRequest('Unknown status');

      // Rule: resume mandatory before leaving Applied
      if (candidate.status === 'Applied' && status !== 'Applied' && !candidate.resumeText && !candidate.resumeFile) {
        throw ApiError.conflict('Resume is mandatory before screening');
      }
      // Rule: offer only after HR approval
      if (status === 'Offer' && !candidate.hrApproved) {
        throw ApiError.conflict('Offer requires HR approval (set hrApproved first)');
      }
      // Pipeline can only move forward (or to Rejected)
      if (status !== 'Rejected' && STAGES.indexOf(status) < STAGES.indexOf(candidate.status)) {
        throw ApiError.conflict(`Cannot move backwards from ${candidate.status} to ${status}`);
      }
      candidate.status = status;
    }

    await candidate.save();
    res.json({ success: true, candidate });
  })
);

module.exports = router;
