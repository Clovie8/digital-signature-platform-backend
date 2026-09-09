const axios = require('axios');
const jwt = require('jsonwebtoken');
const { User, AuditLog } = require('../models');
require('dotenv').config();

const TENANT_ID = process.env.MICROSOFT_TENANT_ID;
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI;

const AUTHORIZE_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me';

class MicrosoftAuthService {
    getAuthorizationUrl() {
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            response_mode: 'query',
            scope: 'openid profile email User.Read',
        });
        return `${AUTHORIZE_URL}?${params.toString()}`;
    }

    async handleCallback(code, ipAddress) {
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

        const profileRes = await axios.get(GRAPH_ME_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const microsoftId = profileRes.data.id;
        const email = profileRes.data.mail || profileRes.data.userPrincipalName;
        const name = profileRes.data.displayName || email;

        if (!email) throw new Error('NO_EMAIL_FROM_MICROSOFT');

        let user = await User.findOne({ where: { microsoftId } });

        if (!user) {
            user = await User.findOne({ where: { email } });

            if (user) {
                await user.update({ microsoftId, authProvider: user.authProvider === 'local' ? 'local' : 'microsoft' });
            } else {
                user = await User.create({
                    name,
                    email,
                    microsoftId,
                    authProvider: 'microsoft',
                    isVerified: true,
                });
            }
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        AuditLog.create({
            action: 'USER_LOGIN_MICROSOFT',
            actorEmail: user.email,
            ipAddress
        }).catch(err => console.error('Failed to write Microsoft login audit log:', err));

        return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }
}

module.exports = new MicrosoftAuthService();