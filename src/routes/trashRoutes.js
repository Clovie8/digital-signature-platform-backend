const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const {
    listTrash,
    moveToTrash,
    restoreFromTrash,
    purgeItem,
    emptyTrash,
    bulkMoveToTrash,
    bulkRestore,
    bulkPurge
} = require('../controllers/trashController');

router.get('/', authenticateToken, listTrash);
router.post('/move', authenticateToken, moveToTrash);
router.post('/restore', authenticateToken, restoreFromTrash);
router.delete('/purge', authenticateToken, purgeItem);
router.delete('/empty', authenticateToken, emptyTrash);
router.post('/bulk-move', authenticateToken, bulkMoveToTrash);
router.post('/bulk-restore', authenticateToken, bulkRestore);
router.delete('/bulk-purge', authenticateToken, bulkPurge);

module.exports = router;
