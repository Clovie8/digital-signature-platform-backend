const express = require('express');
const router = express.Router();
const multer = require('multer');

const { listUsers, listAuditLogs, inviteUser, inviteUsersCsv } = require('../controllers/adminController');
const authenticateToken = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/users', authenticateToken, requireAdmin, listUsers);
router.post('/users/invite', authenticateToken, requireAdmin, inviteUser);
router.post('/users/invite-csv', authenticateToken, requireAdmin, upload.single('file'), inviteUsersCsv);
router.get('/audit-logs', authenticateToken, requireAdmin, listAuditLogs);

module.exports = router;