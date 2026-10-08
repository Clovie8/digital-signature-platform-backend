require('dotenv').config();

const resend = require('./graphMailer');

const generateEmailHtml = ({ title, greeting, paragraphs = [], highlightBox = null, alertBox = null, bigCode = null, cta = null }) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        @media only screen and (max-width: 600px) {
            .email-container { padding: 16px !important; }
            .content-wrapper { padding: 24px 16px !important; }
            .header { padding: 20px 16px !important; }
            .title { font-size: 20px !important; }
            .btn { width: 100% !important; box-sizing: border-box; text-align: center; display: block !important; }
            .doc-name { font-size: 16px !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb;">
    <div class="email-container" style="background-color: #f9fafb; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); border: 1px solid #f3f4f6;">
            
            <!-- Header -->
            <div class="header" style="background-color: #0f172a; padding: 20px 24px; text-align: center;">
                <span style="display: inline-block; vertical-align: middle; background-color: #ffffff; border-radius: 6px; padding: 6px; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); margin-right: 10px;">
                    <img src="${process.env.FRONTEND_URL}/DSign-Logo.svg" width="24" height="24" alt="DSign Logo" style="display: block; border: 0; margin: 0; padding: 0;" />
                </span>
                <h1 style="color: #ffffff; font-size: 18px; font-weight: 600; margin: 0; letter-spacing: 0.3px; display: inline-block; vertical-align: middle;">DSign Platform</h1>
            </div>

            <!-- Body -->
            <div class="content-wrapper" style="padding: 32px 24px;">
                <h2 class="title" style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 20px;">${title}</h2>
                
                ${greeting ? `<p style="font-size: 14px; color: #4b5563; margin-top: 0; margin-bottom: 20px;">${greeting}</p>` : ''}
                
                ${paragraphs.map(p => `<p style="font-size: 14px; color: #4b5563; margin-top: 0; margin-bottom: 20px;">${p}</p>`).join('\n                ')}

                ${highlightBox ? `
                <div style="background-color: #f8fafc; border-left: 3px solid ${highlightBox.color || '#3b82f6'}; padding: 16px; border-radius: 4px; margin-bottom: 28px;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">${highlightBox.label}</p>
                    <p class="doc-name" style="margin: 0; font-size: 15px; font-weight: 600; color: #0f172a; word-break: break-word;">${highlightBox.value}</p>
                </div>
                ` : ''}

                ${alertBox ? `
                <div style="background-color: ${alertBox.type === 'danger' ? '#fef2f2' : (alertBox.type === 'success' ? '#f0fdf4' : '#fffbeb')}; border-radius: 6px; padding: 16px; margin-bottom: 28px;">
                    <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: ${alertBox.type === 'danger' ? '#991b1b' : (alertBox.type === 'success' ? '#166534' : '#b45309')};">${alertBox.title}</h4>
                    <p style="margin: 0; font-size: 13px; color: ${alertBox.type === 'danger' ? '#b91c1c' : (alertBox.type === 'success' ? '#15803d' : '#d97706')};">${alertBox.message}</p>
                </div>
                ` : ''}
                
                ${bigCode ? `
                <div style="text-align: center; margin: 30px 0; background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px dashed #cbd5e1;">
                    <strong style="font-size: 28px; letter-spacing: 6px; color: #0f172a;">${bigCode}</strong>
                </div>
                ` : ''}

                ${cta ? `
                <div style="text-align: center; margin: 32px 0;">
                    <a href="${cta.url}" class="btn" style="display: inline-block; background-color: ${cta.color || '#2563eb'}; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 6px; box-shadow: 0 2px 4px -1px rgba(37, 99, 235, 0.2);">
                        ${cta.text}
                    </a>
                </div>
                <p style="font-size: 12px; color: #64748b; margin-top: 28px; text-align: center; line-height: 1.6;">
                    If the button above does not work, please right-click the link below (or long-press on mobile) and select "Copy Link", then paste it into your browser:<br>
                    <a href="${cta.url}" style="color: #3b82f6; text-decoration: none; margin-top: 6px; display: inline-block; font-weight: 600;">Copy link and paste in browser</a>
                </p>
                ` : ''}
            </div>

            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 20px 24px; border-top: 1px solid #f1f5f9; text-align: center;">
                <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                    This is an automated message from the DSign Platform.<br>
                    Please do not reply to this email.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
`;
};

// 1. sendSigningRequestEmail
const sendSigningRequestEmail = async ({ signerEmail, signerName, token, documentName, otp, subject, introText, logLabel, errorLabel }) => {
    try {
        let secureLink = `${process.env.FRONTEND_URL}/sign/${token}`;
        if (otp) secureLink += `?otp=${otp}`;

        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: signerEmail,
            subject,
            html: generateEmailHtml({
                title: "Signature Request",
                greeting: `Hello <strong>${signerName}</strong>,`,
                paragraphs: [
                    introText,
                    "This is a secure, one-time link. Please do not forward this email."
                ],
                highlightBox: {
                    label: "Document Name",
                    value: documentName
                },
                cta: {
                    url: secureLink,
                    text: "Review & Sign Document"
                }
            })
        };

        const info = await resend.emails.send(mailOptions);
        console.log(`${logLabel} sent to ${signerEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error(`${errorLabel}:`, error);
        return false;
    }
};

// 2. sendSignatureEmail
const sendSignatureEmail = (signerEmail, signerName, token, documentName, otp = null) =>
    sendSigningRequestEmail({
        signerEmail, signerName, token, documentName, otp,
        subject: `Action Required: Please sign ${documentName}`,
        introText: "You have been requested to review and digitally sign the following document.",
        logLabel: 'Email',
        errorLabel: 'Email Dispatch Error'
    });

// 3. sendPasswordResetEmail
const sendPasswordResetEmail = async (userEmail, token) => {
    try {
        const mailOptions = {
            from: `"DSign Security" <notifications@clovisdev.tech>`,
            to: userEmail,
            subject: `DSign - Secure Password Reset Code`,
            html: generateEmailHtml({
                title: "Password Reset Request",
                paragraphs: [
                    "We received a request to reset your DSign password. Please use the secure code below in your application:",
                    "This code is valid for 1 hour. If you did not request this, please safely ignore this email."
                ],
                bigCode: token.substring(0, 6).toUpperCase()
            })
        };

        const info = await resend.emails.send(mailOptions);
        console.log(`Reset email sent to ${userEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Email Dispatch Error:', error);
        return false; 
    }
};

// 4. sendVerificationEmail
const sendVerificationEmail = async (userEmail, token) => {
    try {
        const mailOptions = {
            from: `"DSign Security" <notifications@clovisdev.tech>`,
            to: userEmail,
            subject: `DSign - Verify Your Account`,
            html: generateEmailHtml({
                title: "Welcome to DSign!",
                paragraphs: [
                    "To activate your account, please enter the 6-digit verification code below:"
                ],
                bigCode: token
            })
        };
        await resend.emails.send(mailOptions);
    } catch (error) {
        console.error('Verification Email Error:', error);
    }
};

// 5. sendInvitationEmail
const sendInvitationEmail = async (toEmail, inviterName) => {
    try {
        const registerLink = `${process.env.FRONTEND_URL}/login?register=true&email=${encodeURIComponent(toEmail)}`;

        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: toEmail,
            subject: `${inviterName} invited you to DSign`,
            html: generateEmailHtml({
                title: "You've been invited to DSign",
                paragraphs: [
                    `<strong>${inviterName}</strong> has invited you to join their organization on DSign, a secure digital signature platform.`,
                    "If you weren't expecting this invitation, you can safely ignore this email."
                ],
                cta: {
                    url: registerLink,
                    text: "Accept Invitation"
                }
            })
        };
        await resend.emails.send(mailOptions);
    } catch (error) {
        console.error('Invitation Email Error:', error);
    }
};

// 6. sendAccountDeactivatedEmail
const sendAccountDeactivatedEmail = async (toEmail, name, reason) => {
    try {
        const mailOptions = {
            from: `"DSign Security" <notifications@clovisdev.tech>`,
            to: toEmail,
            subject: `Important: Your DSign Account has been deactivated`,
            html: generateEmailHtml({
                title: "Account Deactivated",
                greeting: `Hello <strong>${name}</strong>,`,
                paragraphs: [
                    "Your DSign account has been deactivated by an administrator.",
                    "You will no longer be able to log in or access your documents.",
                    "If you believe this was a mistake, please contact your organization's administrator."
                ],
                alertBox: reason ? {
                    type: 'danger',
                    title: 'Reason for Deactivation',
                    message: reason
                } : null
            })
        };
        await resend.emails.send(mailOptions);
    } catch (error) {
        console.error('Deactivation Email Error:', error);
    }
};

// 7. sendAccountReactivatedEmail
const sendAccountReactivatedEmail = async (toEmail, name) => {
    try {
        const loginLink = `${process.env.FRONTEND_URL}/login`;
        const mailOptions = {
            from: `"DSign Security" <notifications@clovisdev.tech>`,
            to: toEmail,
            subject: `Your DSign Account has been reactivated`,
            html: generateEmailHtml({
                title: "Account Reactivated",
                greeting: `Hello <strong>${name}</strong>,`,
                paragraphs: [
                    "Good news! Your DSign account has been reactivated by an administrator.",
                    "You can now log in and access your documents as usual."
                ],
                cta: {
                    url: loginLink,
                    text: "Log In to DSign",
                    color: "#16a34a"
                }
            })
        };
        await resend.emails.send(mailOptions);
    } catch (error) {
        console.error('Reactivation Email Error:', error);
    }
};

// 8. sendReviewReadyEmail
const sendReviewReadyEmail = async (initiatorEmail, documentName) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: initiatorEmail,
            subject: `Signatures Completed: ${documentName}`,
            html: generateEmailHtml({
                title: "Signatures Completed",
                paragraphs: [
                    "All requested signers have successfully completed their signatures.",
                    "The document is now awaiting your final review and signature (if applicable)."
                ],
                highlightBox: {
                    label: "Document Name",
                    value: documentName
                },
                alertBox: {
                    type: 'success',
                    title: 'Ready for Review',
                    message: 'Log in to your dashboard to review and finalize the document.'
                }
            })
        };
        await resend.emails.send(mailOptions);
        return true;
    } catch (error) {
        console.error('Review Ready Email Error:', error);
        return false;
    }
};

// 9. sendCompletionEmail
const sendCompletionEmail = async (signerEmail, documentName, secureLink) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: signerEmail,
            subject: `Completed: ${documentName}`,
            html: generateEmailHtml({
                title: "Document Completed",
                paragraphs: [
                    "All parties have successfully signed the document.",
                    "You can view and download the fully executed final copy using the secure link below."
                ],
                highlightBox: {
                    label: "Document Name",
                    value: documentName
                },
                alertBox: {
                    type: 'warning',
                    title: 'Important: Download Your Document',
                    message: 'Please download and securely save your finalized document. Access to this link may expire in the future.'
                },
                cta: {
                    url: secureLink,
                    text: "View Completed Document",
                    color: "#16a34a"
                }
            })
        };
        const info = await resend.emails.send(mailOptions);
        console.log(`Completion email sent to ${signerEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Completion Email Error:', error);
        return false;
    }
};

// 10. sendDeclineEmail
const sendDeclineEmail = async (initiatorEmail, documentName, declinerName, reason) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: initiatorEmail,
            subject: `Declined: ${documentName}`,
            html: generateEmailHtml({
                title: "Signature Declined",
                paragraphs: [
                    `<strong>${declinerName}</strong> has declined to sign the document.`,
                    "The workflow has been halted. You can choose to Revise or Resume the document from your dashboard."
                ],
                highlightBox: {
                    label: "Document Name",
                    value: documentName
                },
                alertBox: {
                    type: 'danger',
                    title: 'Reason for Declining',
                    message: reason || 'No reason provided.'
                }
            })
        };
        await resend.emails.send(mailOptions);
        return true;
    } catch (error) {
        console.error('Decline Email Error:', error);
        return false;
    }
};

// 11. sendRevisionEmail
const sendRevisionEmail = (signerEmail, signerName, token, documentName, otp = null) =>
    sendSigningRequestEmail({
        signerEmail, signerName, token, documentName, otp,
        subject: `Action Required: Revised Document - ${documentName}`,
        introText: "The document you previously reviewed has been revised. Please review and digitally sign the updated version.",
        logLabel: 'Revision Email',
        errorLabel: 'Revision Email Error'
    });

// 12. sendRevisionNoticeEmail
const sendRevisionNoticeEmail = async (signerEmail, signerName, documentName) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: signerEmail,
            subject: `Notice: ${documentName} is being revised`,
            html: generateEmailHtml({
                title: "Document Revision Notice",
                greeting: `Hello <strong>${signerName}</strong>,`,
                paragraphs: [
                    "A document you were a part of is currently being revised by the initiator.",
                    "Once the revisions are complete, you will receive a new email with instructions to sign the updated document."
                ],
                highlightBox: {
                    label: "Document Name",
                    value: documentName
                }
            })
        };
        await resend.emails.send(mailOptions);
        return true;
    } catch (error) {
        console.error('Revision Notice Email Error:', error);
        return false;
    }
};

// 13. sendDeclineWarningEmail
const sendDeclineWarningEmail = async (initiatorEmail, documentName, daysLeft) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: initiatorEmail,
            subject: `Warning: ${documentName} pending void`,
            html: generateEmailHtml({
                title: "Action Required: Pending Void",
                paragraphs: [
                    "A document in your dashboard has been in the 'declined' state for an extended period.",
                    `If no action is taken within the next <strong>${daysLeft} days</strong>, the system will automatically void the workflow permanently.`
                ],
                highlightBox: {
                    label: "Document Name",
                    value: documentName
                },
                alertBox: {
                    type: 'danger',
                    title: 'System Auto-Void Warning',
                    message: `Please Revise or Resume the document within ${daysLeft} days to prevent automatic cancellation.`
                }
            })
        };
        await resend.emails.send(mailOptions);
        return true;
    } catch (error) {
        console.error('Decline Warning Email Error:', error);
        return false;
    }
};

// 14. sendAutoVoidEmail
const sendAutoVoidEmail = async (initiatorEmail, documentName) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: initiatorEmail,
            subject: `Voided: ${documentName}`,
            html: generateEmailHtml({
                title: "Document Auto-Voided",
                paragraphs: [
                    "A document in your dashboard has been automatically voided by the system because it remained in the 'declined' state for more than 7 days.",
                    "No further action can be taken on this workflow. If you still need this agreement signed, you will need to start a new document."
                ],
                highlightBox: {
                    label: "Document Name",
                    value: documentName
                },
                alertBox: {
                    type: 'danger',
                    title: 'Workflow Cancelled',
                    message: 'This document is permanently voided.'
                }
            })
        };
        await resend.emails.send(mailOptions);
        return true;
    } catch (error) {
        console.error('Auto Void Email Error:', error);
        return false;
    }
};

// 15. sendVoidNotificationEmail
const sendVoidNotificationEmail = async (toEmail, signerName, documentName, reason) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: toEmail,
            subject: `Voided: ${documentName}`,
            html: generateEmailHtml({
                title: "Document Voided",
                greeting: `Hello <strong>${signerName}</strong>,`,
                paragraphs: [
                    "The initiator has voided the signature workflow for this document.",
                    "You do not need to take any further action."
                ],
                highlightBox: {
                    label: "Document Name",
                    value: documentName
                },
                alertBox: reason ? {
                    type: 'danger',
                    title: 'Reason for Voiding',
                    message: reason
                } : null
            })
        };
        await resend.emails.send(mailOptions);
        return true;
    } catch (error) {
        console.error('Void Notification Email Error:', error);
        return false;
    }
};

// 16. sendResumeNoticeEmail
const sendResumeNoticeEmail = async (toEmail, signerName, documentName, resumedSignerName) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: toEmail,
            subject: `Resumed: ${documentName}`,
            html: generateEmailHtml({
                title: "Signing Resumed",
                greeting: `Hi <strong>${signerName}</strong>,`,
                paragraphs: [
                    "We wanted to let you know that this document has resumed its signing workflow.",
                    `The issue reported by <strong>${resumedSignerName}</strong> was resolved, and they have been notified to sign the document again.`,
                    "Since you have already signed, no further action is required from you at this time."
                ],
                highlightBox: {
                    label: "Document Name",
                    value: documentName
                }
            })
        };
        await resend.emails.send(mailOptions);
    } catch (error) {
        console.error('Resume Notice Email Error:', error);
    }
};

// 17. sendReminderEmail
const sendReminderEmail = async (signerEmail, signerName, token, documentName, otp, hoursLeft = null) => {
    try {
        let secureLink = `${process.env.FRONTEND_URL}/sign/${token}`;
        if (otp) secureLink += `?otp=${otp}`;

        const isUrgent = hoursLeft !== null && hoursLeft <= 24;
        const subjectPrefix = isUrgent ? 'URGENT:' : 'Reminder:';

        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: signerEmail,
            subject: `${subjectPrefix} Action Required for ${documentName}`,
            html: generateEmailHtml({
                title: "Signature Reminder",
                greeting: `Hello <strong>${signerName}</strong>,`,
                paragraphs: [
                    "This is a friendly reminder that you have a pending request to review and digitally sign the document below."
                ],
                highlightBox: {
                    label: "Document Name",
                    value: documentName
                },
                alertBox: hoursLeft !== null ? {
                    type: isUrgent ? 'danger' : 'warning',
                    title: isUrgent ? '🚨 Urgent: Expiring Soon' : '⏱️ Action Required Soon',
                    message: isUrgent ? `This document will expire in less than ${hoursLeft} hours. Please complete the signing process to avoid workflow cancellation.` : `This document will expire in ${Math.ceil(hoursLeft / 24)} days. Please complete the signing process to avoid workflow cancellation.`
                } : null,
                cta: {
                    url: secureLink,
                    text: "Review & Sign Document"
                }
            })
        };

        const info = await resend.emails.send(mailOptions);
        console.log(`Reminder sent to ${signerEmail}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Reminder Email Error:', error);
        return false;
    }
};

// 18. sendExpirationEmail
const sendExpirationEmail = async (userEmail, documentName) => {
    try {
        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: userEmail,
            subject: `Expired: ${documentName}`,
            html: generateEmailHtml({
                title: "Document Expired",
                paragraphs: [
                    "The time limit to complete the signatures for this document has passed.",
                    "As a result, this workflow has been automatically voided by the system and the document is no longer accessible.",
                    "If you still need to complete this agreement, the initiator must dispatch a new document."
                ],
                highlightBox: {
                    label: "Document Name",
                    value: documentName
                },
                alertBox: {
                    type: 'danger',
                    title: 'Workflow Expired',
                    message: 'This document is permanently voided.'
                }
            })
        };
        await resend.emails.send(mailOptions);
        return true;
    } catch (error) {
        console.error('Expiration Email Error:', error);
        return false;
    }
};

// 19. sendPinResetEmail
const sendPinResetEmail = async (toEmail, otp) => {
    try {
        const mailOptions = {
            from: `"DSign Security" <notifications@clovisdev.tech>`,
            to: toEmail,
            subject: 'Signature PIN Reset Code',
            html: generateEmailHtml({
                title: "Reset Your Signature PIN",
                paragraphs: [
                    "You requested to reset the PIN for one of your saved signatures.",
                    "Your 6-digit reset code is:",
                    "This code will expire in 15 minutes. If you did not request this reset, you can safely ignore this email."
                ],
                bigCode: otp
            })
        };
        await resend.emails.send(mailOptions);
        return true;
    } catch (error) {
        console.error('Pin Reset Email Error:', error);
        return false;
    }
};

const sendOverdueEmail = async (email, documentName) => {
    try {
        const html = generateEmailHtml({
            title: 'Document Overdue',
            paragraphs: [
                'The following document is now past its designated due date.'
            ],
            highlightBox: {
                label: 'DOCUMENT NAME',
                value: documentName
            },
            alertBox: {
                type: 'warning',
                title: 'Still Pending',
                message: 'This document is overdue, but it remains active. You can still complete your signature or review it.'
            }
        });

        const mailOptions = {
            from: `"Digital Signature Platform" <notifications@clovisdev.tech>`,
            to: email,
            subject: 'Overdue: ' + documentName,
            html
        };

        await resend.emails.send(mailOptions);
        console.log('[Email] Overdue notification sent to:', email);
    } catch (error) {
        console.error('[Email] Failed to send overdue notification to', email, error);
    }
};

module.exports = {
    sendSignatureEmail,
    sendPasswordResetEmail,
    sendVerificationEmail,
    sendCompletionEmail,
    sendDeclineEmail,
    sendRevisionEmail,
    sendRevisionNoticeEmail,
    sendDeclineWarningEmail,
    sendAutoVoidEmail,
    sendVoidNotificationEmail,
    sendResumeNoticeEmail,
    sendReminderEmail,
    sendExpirationEmail,
    sendReviewReadyEmail,
    sendPinResetEmail,
    sendInvitationEmail,
    sendAccountDeactivatedEmail,
    sendAccountReactivatedEmail,
    sendOverdueEmail,
};
