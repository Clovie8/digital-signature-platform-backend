const templateService = require('../services/templateService');
const asyncHandler = require('../utils/asyncHandler');
const { NotFoundError, ValidationError, UnauthorizedError } = require('../utils/errors');

const listTemplates = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const templates = await templateService.listTemplates(userId);
    res.status(200).json({ templates });
});

const useTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;

    try {
        const result = await templateService.useTemplate(id, userId);
        res.status(201).json(result);
    } catch (error) {
        if (error.message === 'TEMPLATE_NOT_FOUND') throw new NotFoundError('Template not found.');
        if (error.message === 'FORBIDDEN') throw new UnauthorizedError('You do not have access to this template.');
        throw error;
    }
});

const saveAsTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user.userId;

    try {
        const template = await templateService.saveAsTemplate(id, userId, name);
        res.status(201).json({ message: 'Template saved.', template });
    } catch (error) {
        if (error.message === 'DOCUMENT_NOT_FOUND') throw new NotFoundError('Document not found.');
        if (error.message === 'NOT_OWNER') throw new UnauthorizedError('You do not have access to this document.');
        if (error.message === 'MISSING_NAME') throw new ValidationError('Template name is required.');
        throw error;
    }
});

module.exports = {
    listTemplates,
    useTemplate,
    saveAsTemplate
};