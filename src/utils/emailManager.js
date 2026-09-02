const nodemailer = require('nodemailer');
require('dotenv').config();

// Create the transporter using environment variables
const transporter = nodemailer.createTransport({
    pool: true,
    maxConnections: 1,
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports like 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// Shared template for "you have a document to review and sign" emails.
// sendSignatureEmail and sendRevisionEmail only differ in subject/intro copy.
const sendSigningRequestEmail = async ({ signerEmail, signerName, token, documentName, otp, subject, introText, logLabel, errorLabel }) => {
    try {
        let secureLink = `${process.env.FRONTEND_URL}/sign/${token}`;
        if (otp) secureLink += `?otp=${otp}`;

        const mailOptions = {
            from: `"Digital Signature Platform" <${process.env.SMTP_USER}>`,
            to: signerEmail,
            subject,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #333;">Hello ${signerName},</h2>
                    <p style="color: #555; font-size: 16px;">
                        ${introText}
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
        console.log(`${logLabel} sent to ${signerEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error(`${errorLabel}:`, error);
        // We log the error but don't throw it, so a failed email doesn't crash the database transaction
        return false;
    }
};

const sendSignatureEmail = (signerEmail, signerName, token, documentName, otp = null) =>
    sendSigningRequestEmail({
        signerEmail, signerName, token, documentName, otp,
        subject: `Action Required: Please sign ${documentName}`,
        introText: `You have been requested to review and digitally sign <strong>${documentName}</strong>.`,
        logLabel: 'Email',
        errorLabel: 'Email Dispatch Error'
    });


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

const sendDeclineEmail = async (initiatorEmail, documentName, declinerName, reason) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <${process.env.SMTP_USER}>`,
            to: initiatorEmail,
            subject: `Declined: ${documentName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #b91c1c;">Signature Declined</h2>
                    <p style="color: #555; font-size: 16px;">
                        <strong>${declinerName}</strong> has declined to sign <strong>${documentName}</strong>. The signing workflow has been halted and no further signers will be notified.
                    </p>
                    <div style="background-color: #fef2f2; border-left: 4px solid #b91c1c; padding: 12px 16px; margin: 20px 0;">
                        <p style="color: #7f1d1d; font-size: 14px; margin: 0;"><strong>Reason given:</strong> ${reason}</p>
                    </div>
                </div>
            `
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`Decline email sent to ${initiatorEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Decline Email Error:', error);
        return false;
    }
};

const sendRevisionEmail = (signerEmail, signerName, token, documentName, otp = null) =>
    sendSigningRequestEmail({
        signerEmail, signerName, token, documentName, otp,
        subject: `Action Required: Corrected version of ${documentName}`,
        introText: `A corrected version of <strong>${documentName}</strong> needs your signature. Any previous signature on this document has been reset and must be provided again.`,
        logLabel: 'Revision email',
        errorLabel: 'Revision Email Error'
    });

const sendRevisionNoticeEmail = async (signerEmail, signerName, documentName) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <${process.env.SMTP_USER}>`,
            to: signerEmail,
            subject: `Heads up: ${documentName} was corrected`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #333;">Hello ${signerName},</h2>
                    <p style="color: #555; font-size: 16px;">
                        A corrected version of <strong>${documentName}</strong> has been created. Any previous signature has been reset. You'll receive your signing link once it's your turn in the signing order.
                    </p>
                </div>
            `
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`Revision notice email sent to ${signerEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Revision Notice Email Error:', error);
        return false;
    }
};

const sendDeclineWarningEmail = async (initiatorEmail, documentName, daysLeft) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <${process.env.SMTP_USER}>`,
            to: initiatorEmail,
            subject: `Action needed soon: ${documentName} will auto-void in ${daysLeft} days`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #b45309;">Unresolved Decline</h2>
                    <p style="color: #555; font-size: 16px;">
                        <strong>${documentName}</strong> was declined and has not been resumed or revised. It will automatically be voided in <strong>${daysLeft} days</strong> if no action is taken.
                    </p>
                </div>
            `
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`Decline warning email sent to ${initiatorEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Decline Warning Email Error:', error);
        return false;
    }
};

const sendAutoVoidEmail = async (initiatorEmail, documentName) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <${process.env.SMTP_USER}>`,
            to: initiatorEmail,
            subject: `Voided: ${documentName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #b91c1c;">Document Auto-Voided</h2>
                    <p style="color: #555; font-size: 16px;">
                        <strong>${documentName}</strong> was declined and remained unresolved for 30 days, so it has been automatically voided.
                    </p>
                </div>
            `
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`Auto-void email sent to ${initiatorEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Auto-Void Email Error:', error);
        return false;
    }
};

const sendVoidNotificationEmail = async (signerEmail, signerName, documentName) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <${process.env.SMTP_USER}>`,
            to: signerEmail,
            subject: `Voided: ${documentName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #b91c1c;">Document Voided</h2>
                    <p style="color: #555; font-size: 16px;">
                        Hello ${signerName}, the sender has voided <strong>${documentName}</strong>. No further action is needed from you, and any previous signing link for it is no longer valid.
                    </p>
                </div>
            `
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`Void notification sent to ${signerEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Void Notification Email Error:', error);
        return false;
    }
};

const sendReminderEmail = async (signerEmail, signerName, token, documentName, otp) => {
    try {
        const secureLink = `${process.env.FRONTEND_URL}/sign/${token}?otp=${otp}`;

        const mailOptions = {
            from: `"Digital Signature Platform" <${process.env.SMTP_USER}>`,
            to: signerEmail,
            subject: `Reminder: Action Required for ${documentName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #d97706;">Action Required: Signature Reminder</h2>
                    <p style="color: #555; font-size: 16px;">
                        Hello ${signerName},
                    </p>
                    <p style="color: #555; font-size: 16px;">
                        This is an automated reminder that you have a pending request to review and digitally sign <strong>${documentName}</strong>. 
                        Please complete this at your earliest convenience to avoid workflow expiration.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${secureLink}" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
                            Review and Sign Document
                        </a>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`[Cron] Reminder emailed to ${signerEmail}`);
    } catch (error) {
        console.error('Reminder Email Dispatch Error:', error);
    }
};

const sendExpirationEmail = async (userEmail, documentName) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <${process.env.SMTP_USER}>`,
            to: userEmail,
            subject: `Document Expired: ${documentName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
                    <h2 style="color: #ef4444;">Document Expired</h2>
                    <p style="color: #555; font-size: 16px;">
                        The document <strong>${documentName}</strong> has exceeded the time limit for signatures.
                    </p>
                    <p style="color: #555; font-size: 16px;">
                        As a result, this workflow has been automatically voided by the system and the document is no longer accessible. If you still need to complete this agreement, the initiator must dispatch a new document.
                    </p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Expiration Email Error:', error);
        return false;
    }
};


module.exports = { sendSignatureEmail, sendPasswordResetEmail, sendVerificationEmail, sendCompletionEmail, sendDeclineEmail, sendRevisionEmail, sendRevisionNoticeEmail, sendDeclineWarningEmail, sendAutoVoidEmail, sendVoidNotificationEmail, sendReminderEmail, sendExpirationEmail };