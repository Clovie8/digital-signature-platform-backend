const nodemailer = require('nodemailer');
require('dotenv').config();

// Create the transporter using environment variables
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports like 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const sendSignatureEmail = async (signerEmail, signerName, token, documentName, otp = null, expires = null) => {
    try {
        // Construct the secure link pointing to your future React frontend
        let secureLink = `${process.env.FRONTEND_URL}/sign/${token}`;
        if (otp) secureLink += `?otp=${otp}`;

        const mailOptions = {
            from: `"Digital Signature Platform" <${process.env.SMTP_USER}>`,
            to: signerEmail,
            subject: `Action Required: Please sign ${documentName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #333;">Hello ${signerName},</h2>
                    <p style="color: #555; font-size: 16px;">
                        You have been requested to review and digitally sign <strong>${documentName}</strong>.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${secureLink}" style="background-color: #0056b3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
                            Review and Sign Document
                        </a>
                    </div>
                    <p style="color: #777; font-size: 14px;">
                        This is a secure, one-time link. Please do not forward this email.
                    </p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${signerEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Email Dispatch Error:', error);
        // We log the error but don't throw it, so a failed email doesn't crash the database transaction
        return false; 
    }
};


const sendPasswordResetEmail = async (userEmail, token) => {
    try {
        const mailOptions = {
            from: `"DSign Security" <${process.env.SMTP_USER}>`,
            to: userEmail,
            subject: `DSign - Secure Password Reset Code`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #333;">Password Reset Request</h2>
                    <p style="color: #555; font-size: 16px;">
                        We received a request to reset your DSign password. Please use the secure code below in your application:
                    </p>
                    <div style="text-align: center; margin: 30px 0; background-color: #f8fafc; padding: 15px; border-radius: 6px;">
                        <strong style="font-size: 28px; letter-spacing: 6px; color: #0f172a;">${token.substring(0, 6).toUpperCase()}</strong>
                    </div>
                    <p style="color: #777; font-size: 14px;">
                        This code is valid for 1 hour. If you did not request this, please safely ignore this email.
                    </p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Reset email sent to ${userEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Email Dispatch Error:', error);
        return false; 
    }
};


const sendVerificationEmail = async (userEmail, token) => {
    try {
        const mailOptions = {
            from: `"DSign Security" <${process.env.SMTP_USER}>`,
            to: userEmail,
            subject: `DSign - Verify Your Account`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #333;">Welcome to DSign!</h2>
                    <p style="color: #555; font-size: 16px;">
                        To activate your account, please enter the 6-digit verification code below:
                    </p>
                    <div style="text-align: center; margin: 30px 0; background-color: #f8fafc; padding: 15px; border-radius: 6px;">
                        <strong style="font-size: 28px; letter-spacing: 6px; color: #0f172a;">${token}</strong>
                    </div>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Verification Email Error:', error);
    }
};

const sendOTPEmail = async (signerEmail, signerName, otp) => {
    try {
        const mailOptions = {
            from: `"DSign Security" <${process.env.SMTP_USER}>`,
            to: signerEmail,
            subject: `DSign - Document Access OTP`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #333;">Authentication Required</h2>
                    <p style="color: #555; font-size: 16px;">
                        Hello ${signerName}, here is your one-time password to access the document:
                    </p>
                    <div style="text-align: center; margin: 30px 0; background-color: #f8fafc; padding: 15px; border-radius: 6px;">
                        <strong style="font-size: 28px; letter-spacing: 6px; color: #0f172a;">${otp}</strong>
                    </div>
                    <p style="color: #777; font-size: 14px;">
                        This code is valid for 15 minutes.
                    </p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('OTP Email Error:', error);
        return false;
    }
};

const sendCompletionEmail = async (signerEmail, documentName, secureLink) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <${process.env.SMTP_USER}>`,
            to: signerEmail,
            subject: `Completed: ${documentName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #333;">Document Completed</h2>
                    <p style="color: #555; font-size: 16px;">
                        The document <strong>${documentName}</strong> has been signed by all parties and successfully cryptographically sealed.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${secureLink}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
                            Download Sealed PDF
                        </a>
                    </div>
                    <p style="color: #777; font-size: 14px;">
                        This download link is valid for 7 days. An audit trail has been appended to the final page.
                    </p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Completion Email Error:', error);
        return false;
    }
};

module.exports = { sendSignatureEmail, sendPasswordResetEmail, sendVerificationEmail, sendOTPEmail, sendCompletionEmail };