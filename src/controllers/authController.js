const authService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');
const { AppError, NotFoundError, ValidationError, UnauthorizedError } = require('../utils/errors');
const { AuditLog } = require('../models');
require('dotenv').config();

const registerUser = asyncHandler(async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const user = await authService.register(name, email, password);
        res.status(201).json({ message: 'User registered successfully', user });
    } catch (error) {
        if (error.message === 'USER_EXISTS') throw new ValidationError('User already exists');
        throw error;
    }
});

const loginUser = asyncHandler(async (req, res) => {
    try {
        const { email, password } = req.body;
        const { token, user } = await authService.login(email, password);

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.status(200).json({ message: 'Login successful', user });
    } catch (error) {
        if (error.message === 'INVALID_CREDENTIALS') throw new UnauthorizedError('Invalid email or password');
        if (error.message === 'UNVERIFIED_ACCOUNT') {
            const err = new UnauthorizedError('Account not verified. Please check your email.');
            err.requiresVerification = true;
            throw err;
        }
        throw error;
    }
});

const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    await authService.requestPasswordReset(email);
    res.status(200).json({ message: 'If that email exists, a reset link was sent.' });
});

const resetPassword = asyncHandler(async (req, res) => {
    try {
        const { email, resetToken, newPassword } = req.body;
        await authService.resetPassword(email, resetToken, newPassword);
        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        if (error.message === 'INVALID_TOKEN') throw new ValidationError('Invalid or expired reset token');
        throw error;
    }
});

const verifyEmail = asyncHandler(async (req, res) => {
    try {
        const { email, otp } = req.body;
        await authService.verifyEmail(email, otp);
        res.status(200).json({ message: 'Account verified successfully' });
    } catch (error) {
        if (error.message === 'INVALID_CODE') throw new ValidationError('Invalid verification code');
        throw error;
    }
});

const resendVerification = asyncHandler(async (req, res) => {
    try {
        const { email } = req.body;
        await authService.resendVerification(email);
        res.status(200).json({ message: 'New code sent' });
    } catch (error) {
        if (error.message === 'INVALID_REQUEST') throw new ValidationError('Account already verified or does not exist');
        throw error;
    }
});

const logoutUser = asyncHandler(async (req, res) => {
    if (req.user?.email) {
        AuditLog.create({
            action: 'USER_LOGOUT',
            actorEmail: req.user.email
        }).catch(err => console.error('Failed to write logout audit log:', err));
    }

    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.status(200).json({ message: 'Logged out successfully' });
});

const getUserProfile = asyncHandler(async (req, res) => {
    try {
        const user = await authService.getProfile(req.user.userId);
        res.status(200).json(user);
    } catch (error) {
        if (error.message === 'NOT_FOUND') throw new NotFoundError('User not found');
        throw error;
    }
});

module.exports = { registerUser, loginUser, forgotPassword, resetPassword, verifyEmail, resendVerification, logoutUser, getUserProfile };