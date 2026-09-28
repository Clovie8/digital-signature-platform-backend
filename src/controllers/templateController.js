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

const uploadTemplate = asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('Please upload a PDF file.');
    if (req.file.mimetype !== 'application/pdf') throw new ValidationError('Only PDF files are allowed.');

    const userId = req.user.userId;
    const template = await templateService.uploadTemplateDirectly(userId, req.file.buffer, req.file.originalname);
    
    res.status(201).json({ message: 'Template uploaded successfully.', template });
});

const deleteTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;

    try {
        await templateService.deleteTemplate(id, userId);
        res.status(200).json({ message: 'Template deleted successfully.' });
    } catch (error) {
        if (error.message === 'TEMPLATE_NOT_FOUND') throw new NotFoundError('Template not found.');
        if (error.message === 'NOT_OWNER') throw new UnauthorizedError('You are not the owner of this template.');
        throw error;
    }
});

const getTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;

    try {
        const template = await templateService.getTemplate(id, userId);
        // Map to standard response format used by documents
        res.status(200).json({ document: template });
    } catch (error) {
        if (error.message === 'TEMPLATE_NOT_FOUND') throw new NotFoundError('Template not found.');
        if (error.message === 'FORBIDDEN') throw new UnauthorizedError('You do not have access to this template.');
        throw error;
    }
});

const downloadTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;

    try {
        const { url, fileName } = await templateService.getTemplateDownloadUrl(id, userId);
        res.status(200).json({ url, fileName });
    } catch (error) {
        if (error.message === 'TEMPLATE_NOT_FOUND') throw new NotFoundError('Template not found.');
        if (error.message === 'FORBIDDEN') throw new UnauthorizedError('You do not have access to this template.');
        throw error;
    }
});

module.exports = {
    listTemplates,
    useTemplate,
    saveAsTemplate,
    uploadTemplate,
    deleteTemplate,
    getTemplate,
    downloadTemplate
};