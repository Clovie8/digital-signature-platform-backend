const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
    listDocuments,
    getDocument,
    voidDocument,
    sendReminder,
    downloadDocument,
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

// Protected Creator Routes
router.get('/', authenticateToken, listDocuments);
router.get('/:id', authenticateToken, getDocument);
router.post('/upload', authenticateToken, upload.single('pdf_file'), uploadDocument);
router.post('/:id/dispatch', authenticateToken, dispatchDocument);
router.post('/:id/resume', authenticateToken, resumeDocument);
router.post('/:id/revise', authenticateToken, upload.single('pdf_file'), reviseDocument);
router.post('/:id/void', authenticateToken, voidDocument);
router.post('/:id/remind', authenticateToken, sendReminder);
router.get('/:id/download', authenticateToken, downloadDocument);

// Public Signer Routes (Auth handled via Tokenized Magic Links in URL)
router.get('/sign/:token', getSigningView);
router.post('/sign/:token/complete', completeSigning);
router.post('/sign/:token/decline', declineSigning);

module.exports = router;