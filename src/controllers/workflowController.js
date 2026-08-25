const workflowService = require('../services/workflowService');
const asyncHandler = require('../utils/asyncHandler');
const { AppError, NotFoundError, ValidationError, UnauthorizedError } = require('../utils/errors');

const createWorkflow = asyncHandler(async (req, res) => {
    try {
        const { documentId, signers, initiatorIsFirstSigner } = req.body;
        const initiatorId = req.user.userId;

        const result = await workflowService.create(documentId, signers, initiatorIsFirstSigner, initiatorId);
        res.status(201).json(result);
    } catch (error) {
        if (error.message === 'MISSING_DATA') throw new ValidationError('Missing document ID or signers array.');
        if (error.message === 'DOCUMENT_NOT_FOUND') throw new NotFoundError('Draft document not found or unauthorized.');
        throw error;
    }
});

module.exports = {
    createWorkflow
};
