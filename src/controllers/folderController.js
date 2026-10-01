const folderService = require('../services/folderService');

const createFolder = async (req, res) => {
    try {
        const { name, parentId, type } = req.body;
        const userId = req.user.userId;
        const folder = await folderService.createFolder(name, parentId, userId, type);
        res.status(201).json({ folder });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};


const deleteFolder = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        await folderService.deleteFolder(id, userId);
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const getDirectory = async (req, res) => {
    try {
        const { folderId } = req.query;
        const userId = req.user.userId;
        
        const contents = await folderService.getDirectoryContents(folderId || null, userId);
        res.status(200).json(contents);
    } catch (error) {
        res.status(403).json({ error: error.message });
    }
};


const moveBulkItems = async (req, res) => {
    try {
        const { items, destinationFolderId } = req.body;
        const userId = req.user.userId;
        
        const results = await folderService.moveBulkItems(items, destinationFolderId, userId);
        res.status(200).json({ success: true, results });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const moveItem = async (req, res) => {
    try {
        const { itemId, itemType, destinationFolderId } = req.body;
        const userId = req.user.userId;
        
        const result = await folderService.moveItem(itemId, itemType, destinationFolderId, userId);
        res.status(200).json({ success: true, item: result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};


const getAllFolders = async (req, res) => {
    try {
        const userId = req.user.userId;
        const parentId = req.query.parentId;
        const folders = await folderService.getAllFolders(userId, parentId);
        res.status(200).json({ folders });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};


const getFolderAccess = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const data = await folderService.getFolderAccess(id, userId);
        res.status(200).json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const updateFolderAccess = async (req, res) => {
    try {
        const { id } = req.params;
        const { targetUserId, role } = req.body;
        const userId = req.user.userId;
        const data = await folderService.updateFolderAccess(id, targetUserId, role, userId);
        res.status(200).json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const renameFolder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const userId = req.user.userId;
        
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Folder name is required' });
        }
        
        const folder = await folderService.renameFolder(userId, id, name);
        res.json({ message: 'Folder renamed successfully', folder });
    } catch (error) {
        next(error);
    }
};


const updateFolderPublicStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isPublic } = req.body;
        const userId = req.user.userId;
        const data = await folderService.updatePublicStatus(id, isPublic, userId);
        res.status(200).json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

module.exports = {
    updateFolderPublicStatus,
    getFolderAccess,
    updateFolderAccess,
    getAllFolders,
    createFolder,
    getDirectory,
    moveBulkItems,
    moveItem,
    deleteFolder,
    renameFolder
};


