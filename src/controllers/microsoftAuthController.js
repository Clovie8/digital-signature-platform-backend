const microsoftAuthService = require('../services/microsoftAuthService');
const asyncHandler = require('../utils/asyncHandler');
require('dotenv').config();

const microsoftLogin = (req, res) => {
    res.send(microsoftAuthService.getRedirectPage());
};

const microsoftCallback = asyncHandler(async (req, res) => {
    const { code } = req.query;
    const ipAddress = req.ip || req.connection.remoteAddress;

    if (!code) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=microsoft_auth_failed`);
    }

    try {
        const { token, user } = await microsoftAuthService.handleCallback(code, ipAddress);

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        const redirectPath = user.role === 'admin' ? '/admin' : '/';
        res.redirect(`${process.env.FRONTEND_URL}${redirectPath}`);
    } catch (error) {
        console.error('Microsoft OAuth callback error:', error);

        if (error.message === 'ACCOUNT_EXISTS_USE_ORIGINAL_LOGIN') {
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=account_exists_use_original_login`);
        }

        res.redirect(`${process.env.FRONTEND_URL}/login?error=microsoft_auth_failed`);
    }
});

module.exports = { microsoftLogin, microsoftCallback };