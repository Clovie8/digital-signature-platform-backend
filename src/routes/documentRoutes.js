const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
    listDocuments,
    listPendingApprovals,
    getDashboardSummary,
    getDocument,
    getVersionHistory,
    voidDocument,
    sendReminder,
    downloadDocument,
    getDraftFile,
    saveDraftConfig,
    replaceDraftFile,
    uploadDocument,
    dispatchDocument,
    getSigningView,
    completeSigning,
    declineSigning,
    resumeDocument,
    reviseDocument
} = require('../controllers/documentController');

const authenticateToken = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage() });

// Protected Creator Routes — specific paths BEFORE /:id
router.get('/', authenticateToken, listDocuments);
router.get('/pending-approvals', authenticateToken, listPendingApprovals);
router.get('/dashboard-summary', authenticateToken, getDashboardSummary);
router.get('/:id', authenticateToken, getDocument);
router.get('/:id/versions', authenticateToken, getVersionHistory);
router.post('/upload', authenticateToken, upload.single('pdf_file'), uploadDocument);
router.post('/:id/dispatch', authenticateToken, dispatchDocument);
router.post('/:id/resume', authenticateToken, resumeDocument);
router.post('/:id/revise', authenticateToken, upload.single('pdf_file'), reviseDocument);
router.post('/:id/void', authenticateToken, voidDocument);
router.post('/:id/remind', authenticateToken, sendReminder);
router.get('/:id/download', authenticateToken, downloadDocument);
router.get('/:id/file', authenticateToken, getDraftFile);
router.patch('/:id/draft-config', authenticateToken, saveDraftConfig);
router.post('/:id/file', authenticateToken, upload.single('pdf_file'), replaceDraftFile);

// Public Signer Routes (Auth handled via Tokenized Magic Links in URL)
router.get('/sign/:token', getSigningView);
router.post('/sign/:token/complete', completeSigning);
router.post('/sign/:token/decline', declineSigning);

module.exports = router;