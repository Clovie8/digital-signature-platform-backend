const googleAuthService = require('../services/googleAuthService');
const asyncHandler = require('../utils/asyncHandler');
require('dotenv').config();

const googleLogin = (req, res) => {
    const url = googleAuthService.getAuthorizationUrl();
    res.redirect(url);
};

const googleCallback = asyncHandler(async (req, res) => {
    const { code } = req.query;
    const ipAddress = req.ip || req.connection.remoteAddress;

    if (!code) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_auth_failed`);
    }

    try {
        const { token, user } = await googleAuthService.handleCallback(code, ipAddress);

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });

        const redirectPath = user.role === 'admin' ? '/admin' : '/';
        res.redirect(`${process.env.FRONTEND_URL}${redirectPath}`);
    } catch (error) {
        console.error('Google OAuth callback error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/login?error=google_auth_failed`);
    }
});

module.exports = { googleLogin, googleCallback };