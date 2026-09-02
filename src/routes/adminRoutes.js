const express = require('express');
const router = express.Router();

const { listUsers, listAuditLogs } = require('../controllers/adminController');
const authenticateToken = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');

router.get('/users', authenticateToken, requireAdmin, listUsers);
router.get('/audit-logs', authenticateToken, requireAdmin, listAuditLogs);

module.exports = router;