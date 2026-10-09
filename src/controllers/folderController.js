const folderService = require('../services/folderService');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, UnauthorizedError } = require('../utils/errors');

const createFolder = asyncHandler(async (req, res) => {
    try {
        const { name, parentId, type } = req.body;
        const userId = req.user.userId;
        const folder = await folderService.createFolder(name, parentId, userId, type);
        res.status(201).json({ folder });
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const deleteFolder = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        await folderService.deleteFolder(id, userId);
        res.status(200).json({ success: true });
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const getDirectory = asyncHandler(async (req, res) => {
    try {
        const { folderId } = req.query;
        const userId = req.user.userId;
        
        const contents = await folderService.getDirectoryContents(folderId || null, userId);
        res.status(200).json(contents);
    } catch (error) {
        throw new UnauthorizedError(error.message);
    }
});

const moveBulkItems = asyncHandler(async (req, res) => {
    try {
        const { items, destinationFolderId } = req.body;
        const userId = req.user.userId;
        
        const results = await folderService.moveBulkItems(items, destinationFolderId, userId);
        res.status(200).json({ success: true, results });
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const moveItem = asyncHandler(async (req, res) => {
    try {
        const { itemId, itemType, destinationFolderId } = req.body;
        const userId = req.user.userId;
        
        const result = await folderService.moveItem(itemId, itemType, destinationFolderId, userId);
        res.status(200).json({ success: true, item: result });
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const getAllFolders = asyncHandler(async (req, res) => {
    try {
        const userId = req.user.userId;
        const parentId = req.query.parentId;
        const folders = await folderService.getAllFolders(userId, parentId);
        res.status(200).json({ folders });
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const getFolderAccess = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const data = await folderService.getFolderAccess(id, userId);
        res.status(200).json(data);
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const updateFolderAccess = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const { targetUserId, role } = req.body;
        const userId = req.user.userId;
        const data = await folderService.updateFolderAccess(id, targetUserId, role, userId);
        res.status(200).json(data);
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const renameFolder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user.userId;
    
    if (!name || !name.trim()) {
        throw new ValidationError('Folder name is required');
    }
    
    const folder = await folderService.renameFolder(userId, id, name);
    res.json({ message: 'Folder renamed successfully', folder });
});

const updateFolderPublicStatus = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const { isPublic } = req.body;
        const userId = req.user.userId;
        const data = await folderService.updatePublicStatus(id, isPublic, userId);
        res.status(200).json(data);
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

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
