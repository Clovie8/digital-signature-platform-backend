const signatureService = require('../services/signatureService');
const asyncHandler = require('../utils/asyncHandler');
const { AppError, NotFoundError, ValidationError, UnauthorizedError } = require('../utils/errors');
const { Signature } = require('../models');
const { uploadImageToR2, deleteFileFromR2 } = require('../utils/s3Manager'); 
const crypto = require('crypto');

const submitSignature = asyncHandler(async (req, res) => {
    try {
        const { token, signatureImageKey } = req.body; 
        const signerIp = req.ip || req.connection.remoteAddress;

        if (!token) throw new ValidationError('Access token is required.');

        const result = await signatureService.submit(token, signerIp, signatureImageKey);
        res.status(200).json(result);
    } catch (error) {
        if (error.message === 'INVALID_TOKEN') throw new UnauthorizedError('Invalid token, or document already signed.');
        throw error;
    }
});

const uploadSavedSignature = asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('No signature image provided.');

    const { signerName, signerEmail, saveForFuture } = req.body;
    if (!signerName || !signerEmail) throw new ValidationError('Signer name and email are required.');

    // Generate a unique path for Cloudflare R2
    const fileExt = req.file.originalname.split('.').pop() || 'png';
    const r2FileName = `user-signatures/${crypto.randomUUID()}.${fileExt}`;

    // 1. Upload the cropped image buffer directly to R2
    const signatureUrl = await uploadImageToR2(req.file.buffer, r2FileName);

    // 2. Only save to the database if the user checked the "Save for future use" box
    if (saveForFuture === 'true') {
        await Signature.create({
            signer_name: signerName,
            signer_email: signerEmail,
            signature_url: signatureUrl,
            // If they are logged in via a session token, link their ID. Otherwise, null.
            user_id: req.user ? req.user.userId : null 
        });
    }

    // 3. Return the R2 URL so the frontend can immediately use it for stamping
    res.status(201).json({ 
        message: 'Image processed successfully.', 
        signature: { signature_url: signatureUrl } 
    });
});

const deleteSavedSignature = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const signature = await Signature.findByPk(id);
    if (!signature) throw new NotFoundError('Signature not found.');

    await deleteFileFromR2(signature.signature_url);

    await signature.destroy();

    res.status(200).json({ message: 'Signature deleted successfully.' });
});

module.exports = { submitSignature, uploadSavedSignature, deleteSavedSignature };
