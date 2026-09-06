const signatureService = require('../services/signatureService');
const asyncHandler = require('../utils/asyncHandler');
const { AppError, NotFoundError, ValidationError, UnauthorizedError } = require('../utils/errors');
const { Signature, Signer } = require('../models');
const { uploadImageToR2, deleteFromR2 } = require('../utils/s3Manager'); 
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sendPinResetEmail } = require('../utils/emailManager');

const submitSignature = asyncHandler(async (req, res) => {
    try {
        const { token, signatureImageKey, pin } = req.body;
        const signerIp = req.ip || req.connection.remoteAddress;

        if (!token) throw new ValidationError('Access token is required.');

       const result = await signatureService.submit(token, signerIp, signatureImageKey, pin);
        res.status(200).json(result);
    } catch (error) {
        if (error.message === 'INVALID_TOKEN') throw new UnauthorizedError('Invalid token, or document already signed.');
        throw error;
    }
});

const checkSecurityStatus = asyncHandler(async (req, res) => {
    const { email } = req.query;
    if (!email) throw new ValidationError('Email is required.');
    
    const signer = await Signer.findOne({ where: { email } });
    res.status(200).json({ hasPin: !!signer?.pin_hash });
});

const verifyVault = asyncHandler(async (req, res) => {
    const { email, pin } = req.body;
    if (!email || !pin) throw new ValidationError('Email and PIN are required.');

    const signer = await Signer.findOne({ where: { email } });
    if (!signer || !signer.pin_hash) throw new ValidationError('No security profile found.');

    const isValid = await bcrypt.compare(pin.toString(), signer.pin_hash);
    if (!isValid) throw new UnauthorizedError('Incorrect PIN.');

    res.status(200).json({ message: 'Vault unlocked.' });
});

const uploadSavedSignature = asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('No signature image provided.');

    const { signerName, signerEmail, saveForFuture, pin } = req.body;
    if (!signerName || !signerEmail) throw new ValidationError('Signer name and email are required.');

    const fileExt = req.file.originalname.split('.').pop() || 'png';
    const r2FileName = `user-signatures/${crypto.randomUUID()}.${fileExt}`;

    const signatureUrl = await uploadImageToR2(req.file.buffer, r2FileName);

    if (saveForFuture === 'true') {
        if (!pin || pin.length !== 4) throw new ValidationError('A 4-digit PIN is required to save signatures.');

        // Find existing vault or create a new one
        let signer = await Signer.findOne({ where: { email: signerEmail } });
        
        if (signer) {
            // Verify existing PIN before letting them append a new image
            const isValid = await bcrypt.compare(pin.toString(), signer.pin_hash);
            if (!isValid) throw new UnauthorizedError('Invalid PIN for your Signature Vault.');
        } else {
            // Create a brand new vault profile
            const salt = await bcrypt.genSalt(10);
            const pinHash = await bcrypt.hash(pin.toString(), salt);
            signer = await Signer.create({ 
                email: signerEmail, 
                name: signerName,
                pin_hash: pinHash,
                user_id: req.user ? req.user.userId : null 
            });
        }

        // Save the image mapped to the vault's ID
        await Signature.create({
            signer_id: signer.id,
            signature_url: signatureUrl
        });
    }

    res.status(201).json({ 
        message: 'Image processed successfully.', 
        signature: { signature_url: signatureUrl } 
    });
});


const deleteSavedSignature = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const signature = await Signature.findByPk(id);
    if (!signature) throw new NotFoundError('Signature not found.');

    await deleteFromR2(signature.signature_url);
    await signature.destroy();

    res.status(200).json({ message: 'Signature deleted successfully.' });
});

const requestPinReset = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ValidationError('Email is required.');
    
    const signer = await Signer.findOne({ where: { email } });
    if (!signer) throw new NotFoundError('No signature vault found for this email.');
    if (!signer.pin_hash) throw new ValidationError('This vault is not protected by a PIN.');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); 

    await signer.update({
        reset_otp: otp,
        reset_otp_expires_at: expiresAt
    });

    await sendPinResetEmail(signer.email, otp);

    res.status(200).json({ message: 'Reset code sent to your email.' });
});


const confirmPinReset = asyncHandler(async (req, res) => {
    const { email, otp, newPin } = req.body;
    if (!email) throw new ValidationError('Email is required.');

    const signer = await Signer.findOne({ where: { email } });
    if (!signer) throw new NotFoundError('Signature vault not found.');

    if (!signer.reset_otp || signer.reset_otp !== otp) {
        throw new ValidationError('Invalid reset code.');
    }
    if (new Date() > new Date(signer.reset_otp_expires_at)) {
        throw new ValidationError('Reset code has expired.');
    }
    if (!newPin || newPin.length !== 4) {
        throw new ValidationError('New PIN must be exactly 4 digits.');
    }

    const salt = await bcrypt.genSalt(10);
    const pinHash = await bcrypt.hash(newPin, salt);

    await signer.update({
        pin_hash: pinHash,
        reset_otp: null,
        reset_otp_expires_at: null
    });

    res.status(200).json({ message: 'PIN reset successfully.' });
});


module.exports = { submitSignature, uploadSavedSignature, deleteSavedSignature, checkSecurityStatus, verifyVault, requestPinReset, confirmPinReset };