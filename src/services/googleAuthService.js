const axios = require('axios');
const jwt = require('jsonwebtoken');
const { User, AuditLog } = require('../models');
require('dotenv').config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

class GoogleAuthService {
    getAuthorizationUrl() {
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
            scope: 'openid profile email',
            access_type: 'online',
            prompt: 'select_account',
        });
        return `${AUTHORIZE_URL}?${params.toString()}`;
    }

    getRedirectPage() {
        const authUrl = this.getAuthorizationUrl();
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Redirecting to Google Sign-In — DSign</title>
                <meta http-equiv="refresh" content="1;url=${authUrl}">
            </head>
            <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #FAFAFA;">
                <div style="text-align: center;">
                    <p style="color: #475569; font-size: 14px;">Redirecting you to sign in with Google…</p>
                    <p style="margin-top: 12px;">
                        <a href="${authUrl}" style="color: #0f172a; font-size: 13px;">Click here if you're not redirected automatically</a>
                    </p>
                </div>
            </body>
            </html>
        `;
    }

    async handleCallback(code, ipAddress) {
        // Exchange the authorization code for an access token
        const tokenRes = await axios.post(
            TOKEN_URL,
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const accessToken = tokenRes.data.access_token;

        // Fetch the user's profile
        const profileRes = await axios.get(USERINFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const googleId = profileRes.data.id;
        const email = profileRes.data.email;
        const name = profileRes.data.name || email;

        if (!email) throw new Error('NO_EMAIL_FROM_GOOGLE');

        // Find or create the local user
        let user = await User.findOne({ where: { googleId } });

        if (!user) {
            const existing = await User.findOne({ where: { email } });
            if (existing) {
                throw new Error('ACCOUNT_EXISTS_USE_ORIGINAL_LOGIN');
            }

            // Brand new user, created via Google sign-in
            user = await User.create({
                name,
                email,
                googleId,
                authProvider: 'google',
                isVerified: true, 
            });
        }

        
        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        AuditLog.create({
            action: 'USER_LOGIN_GOOGLE',
            actorEmail: user.email,
            ipAddress
        }).catch(err => console.error('Failed to write Google login audit log:', err));

        return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }
}

module.exports = new GoogleAuthService();