const express = require('express');
const router = express.Router();

const { 
    registerUser, 
    loginUser, 
    forgotPassword, 
    resetPassword,
    verifyEmail,
    resendVerification,
    logoutUser,
    getUserProfile,
    checkInvite,
    completeInvite,
    searchUsers,
    updateProfile,
    changePassword
} = require('../controllers/authController');

const { microsoftLogin, microsoftCallback } = require('../controllers/microsoftAuthController');
const { googleLogin, googleCallback } = require('../controllers/googleAuthController');
const authenticateToken = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify', verifyEmail);
router.post('/resend-verification', resendVerification);
router.get('/check-invite', checkInvite);
router.post('/complete-invite', completeInvite);

// Microsoft OAuth
router.get('/microsoft', microsoftLogin);
router.get('/microsoft/callback', microsoftCallback);
router.get('/google', googleLogin);
router.get('/google/callback', googleCallback);

// Protected routes
router.post('/logout', authenticateToken, logoutUser);
router.get('/me', authenticateToken, getUserProfile);
router.patch('/me', authenticateToken, updateProfile);
router.patch('/change-password', authenticateToken, changePassword);
// Search users
router.get('/users/search', authenticateToken, searchUsers);

module.exports = router;