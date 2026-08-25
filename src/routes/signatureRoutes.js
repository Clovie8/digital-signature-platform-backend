const express = require('express');
const router = express.Router();
const { submitSignature } = require('../controllers/signatureController');

// Publicly accessible route, secured by the UUID token in the body
router.post('/submit', submitSignature);

module.exports = router;