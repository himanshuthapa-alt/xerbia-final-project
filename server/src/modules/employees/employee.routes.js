const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const asyncHandler = require('../../utils/asyncHandler');
const { requireAuth, requireRole } = require('../../middleware/auth');
const ctrl = require('./employee.controller');

// ---- upload hardening: whitelist types, cap size, randomize filename ----
const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    // never trust the client's filename
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF/PNG/JPG/WEBP files are allowed'));
  },
});

router.use(requireAuth);

router.get('/', requireRole('HR', 'ORG_ADMIN', 'MANAGER', 'TEAM_LEAD', 'FINANCE', 'AUDITOR'), asyncHandler(ctrl.listEmployees));
router.post('/', requireRole('HR', 'ORG_ADMIN'), asyncHandler(ctrl.createEmployee));
router.get('/:id', asyncHandler(ctrl.getEmployee)); // self-or-privileged check inside
router.patch('/:id', requireRole('HR', 'ORG_ADMIN'), asyncHandler(ctrl.updateEmployee));
router.delete('/:id', requireRole('HR', 'ORG_ADMIN'), asyncHandler(ctrl.archiveEmployee));
router.post('/:id/documents', requireRole('HR', 'ORG_ADMIN'), upload.single('file'), asyncHandler(ctrl.uploadDocument));

module.exports = router;
