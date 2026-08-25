const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models'); // Import Sequelize User model
const { sendPasswordResetEmail, sendVerificationEmail } = require('../utils/emailManager');
const { Op } = require('sequelize');
require('dotenv').config();

class AuthService {
    async register(name, email, password) {
        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            throw new Error('USER_EXISTS');
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Generate a 6-digit secure OTP
        const otpToken = crypto.randomInt(100000, 999999).toString();

        // Save to database using Sequelize
        const newUser = await User.create({
            name,
            email,
            passwordHash,
            verificationToken: otpToken
        });

        // Fire the verification email
        sendVerificationEmail(email, otpToken).catch(err =>
            console.error('Failed to send verification email:', err)
        );

        return { id: newUser.id, name: newUser.name, email: newUser.email };
    }

    async login(email, password) {
        // Find the user
        const user = await User.findOne({ where: { email } });
        if (!user) throw new Error('INVALID_CREDENTIALS');

        // Check password
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) throw new Error('INVALID_CREDENTIALS');

        // Check if verified
        if (!user.isVerified) {
            const newOtp = crypto.randomInt(100000, 999999).toString();
            await user.update({ verificationToken: newOtp });
            sendVerificationEmail(user.email, newOtp).catch(console.error);
            throw new Error('UNVERIFIED_ACCOUNT');
        }

        // Generate JWT Token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return { token, user: { id: user.id, name: user.name, email: user.email } };
    }

    async requestPasswordReset(email) {
        const user = await User.findOne({ where: { email } });
        if (!user) return; // Silent return for security (don't reveal if email exists)

        const resetToken = crypto.randomBytes(3).toString('hex').toUpperCase();
        const expireTime = new Date(Date.now() + 3600000); // 1 hour from now

        await user.update({
            resetPasswordToken: resetToken,
            resetPasswordExpiresAt: expireTime
        });

        await sendPasswordResetEmail(email, resetToken);
    }

    async resetPassword(email, resetToken, newPassword) {
        const user = await User.findOne({
            where: {
                email,
                resetPasswordToken: resetToken,
                resetPasswordExpiresAt: { [Op.gt]: new Date() } // Ensures it hasn't expired
            }
        });

        if (!user) throw new Error('INVALID_TOKEN');

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        await user.update({
            passwordHash,
            resetPasswordToken: null,
            resetPasswordExpiresAt: null
        });
    }

    async verifyEmail(email, otp) {
        const user = await User.findOne({
            where: { email, verificationToken: otp }
        });

        if (!user) throw new Error('INVALID_CODE');

        await user.update({
            isVerified: true,
            verificationToken: null
        });
    }

    async resendVerification(email) {
        const user = await User.findOne({ where: { email } });
        if (!user || user.isVerified) throw new Error('INVALID_REQUEST');

        const newOtp = crypto.randomInt(100000, 999999).toString();
        await user.update({ verificationToken: newOtp });
        
        await sendVerificationEmail(email, newOtp);
    }

    async getProfile(userId) {
        const user = await User.findByPk(userId, {
            attributes: ['id', 'name', 'email', 'isVerified']
        });
        if (!user) throw new Error('NOT_FOUND');
        return user;
    }
}

module.exports = new AuthService();