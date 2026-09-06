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
    searchUsers
} = require('../controllers/authController');

const authenticateToken = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify', verifyEmail);
router.post('/resend-verification', resendVerification);

// Protected routes
router.post('/logout', authenticateToken, logoutUser);
router.get('/me', authenticateToken, getUserProfile);
// Search users
router.get('/users/search', authenticateToken, searchUsers);

module.exports = router;