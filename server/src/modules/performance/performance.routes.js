// Performance reviews — goals, quarterly evaluation, ratings 1..5.
const router = require('express').Router();
const mongoose = require('mongoose');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { requireAuth, requireRole } = require('../../middleware/auth');

const reviewSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    quarter: { type: String, required: true }, // e.g. "2026-Q2"
    goals: [{ title: String, done: { type: Boolean, default: false } }],
    kpiScore: { type: Number, min: 0, max: 100 },
    attendanceScore: { type: Number, min: 0, max: 100 },
    selfAssessment: String,
    managerFeedback: String,
    managerRating: { type: Number, min: 1, max: 5 },
    // 5 Outstanding / 4 Excellent / 3 Good / 2 Needs Improvement / 1 Unsatisfactory
    overall: {
      type: String,
      enum: ['Outstanding', 'Excellent', 'Good', 'Needs Improvement', 'Unsatisfactory'],
    },
    promotionRecommended: { type: Boolean, default: false },
    status: { type: String, enum: ['Goals Set', 'In Review', 'Finalized'], default: 'Goals Set' },
  },
  { timestamps: true }
);
reviewSchema.index({ employee: 1, quarter: 1 }, { unique: true });

const Review = mongoose.model('PerformanceReview', reviewSchema);

const RATING_LABELS = { 5: 'Outstanding', 4: 'Excellent', 3: 'Good', 2: 'Needs Improvement', 1: 'Unsatisfactory' };

router.use(requireAuth);

// POST /api/performance — manager assigns goals / opens a review cycle
router.post(
  '/',
  requireRole('MANAGER', 'TEAM_LEAD', 'HR', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const { employee, quarter, goals } = req.body || {};
    if (!employee || !quarter) throw ApiError.badRequest('employee and quarter are required');
    const review = await Review.create({ employee, quarter, goals: goals || [] });
    res.status(201).json({ success: true, review });
  })
);

// PATCH /api/performance/:id/self — employee self assessment
router.patch(
  '/:id/self',
  asyncHandler(async (req, res) => {
    const review = await Review.findById(req.params.id);
    if (!review) throw ApiError.notFound('Review not found');
    if (String(review.employee) !== String(req.user.employeeId)) throw ApiError.forbidden('Not your review');
    if (review.status === 'Finalized') throw ApiError.conflict('Review is finalized');

    review.selfAssessment = req.body.selfAssessment || review.selfAssessment;
    review.status = 'In Review';
    await review.save();
    res.json({ success: true, review });
  })
);

// PATCH /api/performance/:id/evaluate — manager scores + finalizes
router.patch(
  '/:id/evaluate',
  requireRole('MANAGER', 'TEAM_LEAD', 'HR', 'ORG_ADMIN'),
  asyncHandler(async (req, res) => {
    const review = await Review.findById(req.params.id);
    if (!review) throw ApiError.notFound('Review not found');
    if (review.status === 'Finalized') throw ApiError.conflict('Review already finalized');

    const { kpiScore, attendanceScore, managerFeedback, managerRating, promotionRecommended, finalize } = req.body || {};
    if (kpiScore !== undefined) review.kpiScore = kpiScore;
    if (attendanceScore !== undefined) review.attendanceScore = attendanceScore;
    if (managerFeedback !== undefined) review.managerFeedback = managerFeedback;
    if (managerRating !== undefined) {
      review.managerRating = managerRating;
      review.overall = RATING_LABELS[managerRating];
    }
    if (promotionRecommended !== undefined) review.promotionRecommended = promotionRecommended;
    if (finalize) review.status = 'Finalized';

    await review.save();
    res.json({ success: true, review });
  })
);

// GET /api/performance/me | /api/performance?employee=
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const reviews = await Review.find({ employee: req.user.employeeId }).sort('-quarter');
    res.json({ success: true, reviews });
  })
);

router.get(
  '/',
  requireRole('MANAGER', 'TEAM_LEAD', 'HR', 'ORG_ADMIN', 'AUDITOR'),
  asyncHandler(async (req, res) => {
    const filter = req.query.employee ? { employee: req.query.employee } : {};
    const reviews = await Review.find(filter).populate('employee', 'employeeId name').sort('-quarter');
    res.json({ success: true, reviews });
  })
);

module.exports = router;
