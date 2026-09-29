const googleAuthService = require('../services/googleAuthService');
const asyncHandler = require('../utils/asyncHandler');
require('dotenv').config();

const googleLogin = (req, res) => {
    res.send(googleAuthService.getRedirectPage());
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
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        const redirectPath = user.role === 'admin' ? '/admin' : '/';
        res.redirect(`${process.env.FRONTEND_URL}${redirectPath}`);
    } catch (error) {
        console.error('Google OAuth callback error:', error);

        if (error.message === 'ACCOUNT_EXISTS_USE_ORIGINAL_LOGIN') {
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=account_exists_use_original_login`);
        }

        res.redirect(`${process.env.FRONTEND_URL}/login?error=google_auth_failed`);
    }
});

module.exports = { googleLogin, googleCallback };