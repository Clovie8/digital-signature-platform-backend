const express = require('express');
const router = express.Router();
const multer = require('multer');

const { 
    uploadDocument, 
    dispatchDocument, 
    getSigningView, 
    completeSigning,
    listDocuments,
    listPendingApprovals
} = require('../controllers/documentController');

const authenticateToken = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage() });

// Protected Creator Routes
router.get('/', authenticateToken, listDocuments);
router.get('/pending-approvals', authenticateToken, listPendingApprovals);
router.post('/upload', authenticateToken, upload.single('pdf_file'), uploadDocument);
router.post('/:id/dispatch', authenticateToken, dispatchDocument);

// Public Signer Routes (Auth handled via Tokenized Magic Links in URL)
router.get('/sign/:token', getSigningView);
router.post('/sign/:token/complete', completeSigning);

module.exports = router;