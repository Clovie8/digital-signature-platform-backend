const express = require('express');
const router = express.Router();
const { createFolder, getDirectory, moveBulkItems, moveItem, getAllFolders, getFolderAccess, updateFolderAccess, updateFolderPublicStatus, deleteFolder , renameFolder } = require('../controllers/folderController');
const authenticateToken = require('../middleware/authMiddleware');

router.put('/:id/rename', authenticateToken, renameFolder);
router.post('/', authenticateToken, createFolder);
router.get('/', authenticateToken, getDirectory);
router.get('/test-all', async (req, res) => {
    const folderService = require('../services/folderService');
    try {
        const folders = await folderService.getAllFolders('0ed71ced-8e17-4e31-86f1-5426c363fa9d', true);
        res.json({folders});
    } catch(e) { res.status(500).json({e: e.message}) }
});
router.get('/all', authenticateToken, getAllFolders);
router.put('/move-bulk', authenticateToken, moveBulkItems);
router.put('/move', authenticateToken, moveItem);
router.delete('/:id', authenticateToken, deleteFolder);

router.get('/:id/access', authenticateToken, getFolderAccess);
router.put('/:id/access', authenticateToken, updateFolderAccess);
router.put('/:id/public', authenticateToken, updateFolderPublicStatus);

module.exports = router;
