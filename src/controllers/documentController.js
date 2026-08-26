const jwt = require('jsonwebtoken');
const documentService = require('../services/documentService');
const asyncHandler = require('../utils/asyncHandler');
const { AppError, NotFoundError, ValidationError, UnauthorizedError } = require('../utils/errors');
require('dotenv').config();

const listDocuments = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const userEmail = req.user.email;
    const documents = await documentService.listDocuments(userId, userEmail);
    res.status(200).json({ documents });
});

const listPendingApprovals = asyncHandler(async (req, res) => {
    const userEmail = req.user.email;
    const pending = await documentService.listPendingForSigner(userEmail);
    res.status(200).json({ pending });
});

const getDashboardSummary = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const userEmail = req.user.email;
    const summary = await documentService.getDashboardSummary(userId, userEmail);
    res.status(200).json(summary);
});

const getDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    const userEmail = req.user.email;

    try {
        const document = await documentService.getDocument(id, userId, userEmail);
        res.status(200).json({ document });
    } catch (error) {
        if (error.message === 'DOCUMENT_NOT_FOUND') throw new NotFoundError('Document not found.');
        if (error.message === 'NOT_OWNER') throw new UnauthorizedError('You do not have access to this document.');
        throw error;
    }
});

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
        if (error.message === 'DOCUMENT_DECLINED') throw new ValidationError('This document was declined and is no longer available for signing.');
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

const declineSigning = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { reason } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    try {
        await documentService.declineSigning(token, reason, ipAddress);
        res.status(200).json({ message: 'Signature declined. The initiator has been notified.' });
    } catch (error) {
        if (error.message === 'INVALID_STATE') throw new UnauthorizedError('Invalid token, or document already resolved.');
        if (error.message === 'MISSING_REASON') throw new ValidationError('Please provide a reason for declining.');
        throw error;
    }
});

const resumeDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const initiatorId = req.user.userId;
    const initiatorEmail = req.user.email;
    const ipAddress = req.ip || req.connection.remoteAddress;

    try {
        const { document } = await documentService.resumeDocument(id, initiatorId, initiatorEmail, ipAddress);
        res.status(200).json({ message: 'Signer re-notified. Workflow resumed.', document });
    } catch (error) {
        if (error.message === 'DOCUMENT_NOT_FOUND') throw new NotFoundError('Document not found.');
        if (error.message === 'NOT_OWNER') throw new UnauthorizedError('Only the initiator can resume this document.');
        if (error.message === 'INVALID_STATE') throw new ValidationError('Document is not in a declined state.');
        if (error.message === 'RESUME_LIMIT_REACHED') throw new ValidationError('This document has already been resumed the maximum number of times. Create a revision or void it instead.');
        throw error;
    }
});

const reviseDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const initiatorId = req.user.userId;
    const initiatorEmail = req.user.email;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const newFileBuffer = req.file ? req.file.buffer : null;
    const newFileName = req.file ? req.file.originalname : null;

    try {
        const { document, isInitiatorFirst, redirectToken } = await documentService.reviseDocument(id, initiatorId, initiatorEmail, ipAddress, newFileBuffer, newFileName);
        res.status(201).json({ message: 'Revised version created. All signers have been notified.', document, isInitiatorFirst, redirectToken });
    } catch (error) {
        if (error.message === 'DOCUMENT_NOT_FOUND') throw new NotFoundError('Document not found.');
        if (error.message === 'NOT_OWNER') throw new UnauthorizedError('Only the initiator can revise this document.');
        if (error.message === 'INVALID_STATE') throw new ValidationError('Document is not in a declined state.');
        throw error;
    }
});

const voidDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const initiatorId = req.user.userId;
    const initiatorEmail = req.user.email;
    const ipAddress = req.ip || req.connection.remoteAddress;

    try {
        const { document } = await documentService.voidDocument(id, initiatorId, initiatorEmail, ipAddress);
        res.status(200).json({ message: 'Document voided.', document });
    } catch (error) {
        if (error.message === 'DOCUMENT_NOT_FOUND') throw new NotFoundError('Document not found.');
        if (error.message === 'NOT_OWNER') throw new UnauthorizedError('Only the initiator can void this document.');
        if (error.message === 'INVALID_STATE') throw new ValidationError('This document can no longer be voided.');
        throw error;
    }
});

const sendReminder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const initiatorId = req.user.userId;
    const initiatorEmail = req.user.email;
    const ipAddress = req.ip || req.connection.remoteAddress;

    try {
        const { signerName } = await documentService.sendReminder(id, initiatorId, initiatorEmail, ipAddress);
        res.status(200).json({ message: `Reminder sent to ${signerName}.` });
    } catch (error) {
        if (error.message === 'DOCUMENT_NOT_FOUND') throw new NotFoundError('Document not found.');
        if (error.message === 'NOT_OWNER') throw new UnauthorizedError('Only the initiator can send a reminder for this document.');
        if (error.message === 'INVALID_STATE') throw new ValidationError('This document is not awaiting a signature right now.');
        if (error.message === 'NO_PENDING_STEP') throw new ValidationError('No one is currently pending on this document.');
        if (error.message === 'SELF_SIGNER') throw new ValidationError("It's currently your turn to sign — there's no one to remind.");
        if (error.message === 'COOLDOWN_ACTIVE') throw new ValidationError(`Please wait ${error.minutesRemaining} more minute(s) before reminding this signer again.`);
        throw error;
    }
});

const downloadDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    const userEmail = req.user.email;

    try {
        const { url, fileName } = await documentService.getDownloadUrl(id, userId, userEmail);
        res.status(200).json({ url, fileName });
    } catch (error) {
        if (error.message === 'DOCUMENT_NOT_FOUND') throw new NotFoundError('Document not found.');
        if (error.message === 'NOT_OWNER') throw new UnauthorizedError('You do not have access to this document.');
        if (error.message === 'INVALID_STATE') throw new ValidationError('This document has not been completed yet.');
        throw error;
    }
});

module.exports = {
    listDocuments,
    listPendingApprovals,
    getDashboardSummary,
    getDocument,
    voidDocument,
    sendReminder,
    downloadDocument,
    uploadDocument,
    dispatchDocument,
    getSigningView,
    completeSigning,
    declineSigning,
    resumeDocument,
    reviseDocument
};