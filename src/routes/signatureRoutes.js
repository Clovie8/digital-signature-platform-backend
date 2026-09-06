const express = require('express');
const router = express.Router();
const multer = require('multer');
const { submitSignature, uploadSavedSignature, deleteSavedSignature, checkSecurityStatus, verifyVault, requestPinReset, confirmPinReset } = require('../controllers/signatureController');

const upload = multer({ storage: multer.memoryStorage() });

// Publicly accessible route, secured by the UUID token in the body
router.post('/submit', submitSignature);
router.post('/upload', upload.single('signatureImage'), uploadSavedSignature);
router.delete('/:id', deleteSavedSignature);
router.get('/security-status', checkSecurityStatus);
router.post('/verify-vault', verifyVault);
router.post('/reset-pin-request', requestPinReset);
router.post('/reset-pin-confirm', confirmPinReset);;

module.exports = router;