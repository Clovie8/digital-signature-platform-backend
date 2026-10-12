const trashService = require('../services/trashService');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError } = require('../utils/errors');

const listTrash = asyncHandler(async (req, res) => {
    try {
        const userId = req.user.userId;
        const data = await trashService.getTrashContents(userId);
        res.status(200).json(data);
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const moveToTrash = asyncHandler(async (req, res) => {
    try {
        const { itemType, itemId } = req.body;
        const userId = req.user.userId;
        if (!itemType || !itemId) {
            throw new ValidationError('itemType and itemId are required');
        }
        const result = await trashService.moveToTrash(itemType, itemId, userId);
        res.status(200).json(result);
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const restoreFromTrash = asyncHandler(async (req, res) => {
    try {
        const { itemType, itemId } = req.body;
        const userId = req.user.userId;
        if (!itemType || !itemId) {
            throw new ValidationError('itemType and itemId are required');
        }
        const result = await trashService.restoreItem(itemType, itemId, userId);
        res.status(200).json(result);
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const purgeItem = asyncHandler(async (req, res) => {
    try {
        const { itemType, itemId } = req.body;
        const userId = req.user.userId;
        if (!itemType || !itemId) {
            throw new ValidationError('itemType and itemId are required');
        }
        const result = await trashService.purgeItem(itemType, itemId, userId);
        res.status(200).json(result);
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const emptyTrash = asyncHandler(async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await trashService.emptyTrash(userId);
        res.status(200).json(result);
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const bulkMoveToTrash = asyncHandler(async (req, res) => {
    try {
        const { items } = req.body; // array of { type, id }
        const userId = req.user.userId;
        if (!Array.isArray(items) || items.length === 0) {
            throw new ValidationError('Items array is required');
        }
        for (const item of items) {
            await trashService.moveToTrash(item.type, item.id, userId);
        }
        res.status(200).json({ success: true, message: `${items.length} items moved to Trash` });
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const bulkRestore = asyncHandler(async (req, res) => {
    try {
        const { items } = req.body; // array of { type, id }
        const userId = req.user.userId;
        if (!Array.isArray(items) || items.length === 0) {
            throw new ValidationError('Items array is required');
        }
        for (const item of items) {
            await trashService.restoreItem(item.type, item.id, userId);
        }
        res.status(200).json({ success: true, message: `${items.length} items restored from Trash` });
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

const bulkPurge = asyncHandler(async (req, res) => {
    try {
        const { items } = req.body; // array of { type, id }
        const userId = req.user.userId;
        if (!Array.isArray(items) || items.length === 0) {
            throw new ValidationError('Items array is required');
        }
        for (const item of items) {
            await trashService.purgeItem(item.type, item.id, userId);
        }
        res.status(200).json({ success: true, message: `${items.length} items permanently deleted` });
    } catch (error) {
        throw new ValidationError(error.message);
    }
});

module.exports = {
    listTrash,
    moveToTrash,
    restoreFromTrash,
    purgeItem,
    emptyTrash,
    bulkMoveToTrash,
    bulkRestore,
    bulkPurge
};
