const express = require('express');
const router = express.Router();
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 uploads per window
    message: { error: 'Too many uploads from this IP, please try again later.' }
});

const {
    listDocuments,
    listPendingApprovals,
    getDashboardSummary,
    getDocument,
    getVersionHistory,
    voidDocument,
    sendReminder,
    downloadDocument,
    getReviewFile,
    approveDocument,
    getDraftFile,
    saveDraftConfig,
    replaceDraftFile,
    uploadDocument,
    dispatchDocument,
    getSigningView,
    completeSigning,
    declineSigning,
    resumeDocument,
    reviseDocument,
    editSigner,
    renameDocument
} = require('../controllers/documentController');

const authenticateToken = require('../middleware/authMiddleware');

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

// Protected Creator Routes — specific paths BEFORE /:id
router.get('/', authenticateToken, listDocuments);
router.get('/pending-approvals', authenticateToken, listPendingApprovals);
router.get('/dashboard-summary', authenticateToken, getDashboardSummary);
router.get('/:id', authenticateToken, getDocument);
router.get('/:id/versions', authenticateToken, getVersionHistory);
router.post('/upload', authenticateToken, uploadLimiter, upload.single('pdf_file'), uploadDocument);
router.post('/:id/dispatch', authenticateToken, dispatchDocument);
router.post('/:id/resume', authenticateToken, resumeDocument);
router.post('/:id/revise', authenticateToken, reviseDocument);
router.post('/:id/void', authenticateToken, voidDocument);
router.post('/:id/remind', authenticateToken, sendReminder);
router.get('/:id/download', authenticateToken, downloadDocument);
router.get('/:id/review', authenticateToken, getReviewFile);
router.post('/:id/approve', authenticateToken, approveDocument);
router.get('/:id/file', authenticateToken, getDraftFile);
router.patch('/:id/draft-config', authenticateToken, saveDraftConfig);
router.post('/:id/file', authenticateToken, uploadLimiter, upload.single('pdf_file'), replaceDraftFile);

// Edit Signer Route
router.put('/:documentId/steps/:stepId', authenticateToken, editSigner);

// Rename Document Route
router.put('/:id/rename', authenticateToken, renameDocument);

// Public Signer Routes (Auth handled via Tokenized Magic Links in URL)
router.get('/sign/:token', getSigningView);
router.post('/sign/:token/complete', completeSigning);
router.post('/sign/:token/decline', declineSigning);

module.exports = router;