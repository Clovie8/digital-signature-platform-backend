const jwt = require('jsonwebtoken');
const documentService = require('../services/documentService');
const asyncHandler = require('../utils/asyncHandler');
const { AppError, NotFoundError, ValidationError, UnauthorizedError } = require('../utils/errors');
require('dotenv').config();

const uploadDocument = asyncHandler(async (req, res) => {
    try {
        const initiatorId = req.user.userId;
        const document = await documentService.upload(req.file.buffer, req.file.originalname, initiatorId);
        res.status(201).json({ message: 'Document uploaded securely to Cloud', document });
    } catch (error) {
        if (error.message === 'NO_FILE') throw new ValidationError('No PDF file uploaded.');
        throw error;
    }
});

const dispatchDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { signers, fields } = req.body;
    const initiatorEmail = req.user.email;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await documentService.dispatch(id, signers, fields, initiatorEmail, ipAddress);
    res.status(200).json({ message: 'Document dispatched.', ...result });
});

const listDocuments = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const data = await documentService.listDocuments(userId);
    res.status(200).json(data);
});

const listPendingApprovals = asyncHandler(async (req, res) => {
    const email = req.user.email;
    const pending = await documentService.listPendingForSigner(email);
    res.status(200).json(pending);
});
const getSigningView = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { otp } = req.query; 

    const sessionToken = req.cookies?.token; 
    let loggedInEmail = null;
    if (sessionToken) {
        try {
            const decoded = jwt.verify(sessionToken, process.env.JWT_SECRET);
            loggedInEmail = decoded.email; 
        } catch (err) { }
    }

    try {
        const data = await documentService.getSigningViewData(token, otp, loggedInEmail);
        res.status(200).json(data);
    } catch (error) {
        if (error.message === 'INVALID_LINK') throw new NotFoundError('Invalid or expired signing link.');
        if (error.message === 'ALREADY_SIGNED') throw new ValidationError('This document has already been signed or voided by this user.');
        if (error.message === 'INTEGRITY_COMPROMISED') throw new ValidationError('Document Integrity Compromised.');
        throw error;
    }
});

const completeSigning = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { completedFields, updatedFields } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const { step, document } = await documentService.completeSigning(token, completedFields, updatedFields, ipAddress);
    
    res.status(200).json({ message: 'Document securely signed and sealed.' });

    await documentService.handleNextWorkflowStep(step, document);
});

module.exports = {
    uploadDocument,
    dispatchDocument,
    getSigningView,
    completeSigning,
    listDocuments,
    listPendingApprovals
};
