const cron = require('node-cron');
const { Document, AuditLog, User } = require('../models');
const { sendDeclineWarningEmail, sendAutoVoidEmail } = require('./emailManager');

const WARNING_AFTER_DAYS = 23;
const VOID_AFTER_DAYS = 30;

const runDeclineExpiryCheck = async () => {
    const declinedDocs = await Document.findAll({ where: { status: 'declined' }, include: [User] });

    for (const document of declinedDocs) {
        const daysSinceDecline = (Date.now() - new Date(document.updated_at)) / (1000 * 60 * 60 * 24);

        if (daysSinceDecline >= VOID_AFTER_DAYS) {
            await document.update({ status: 'voided' });
            await AuditLog.create({
                document_id: document.id,
                action: 'AUTO_VOIDED: unresolved decline, 30 days',
                actorEmail: 'system@dsign.local'
            });
            await sendAutoVoidEmail(document.User.email, document.fileName);
        } else if (daysSinceDecline >= WARNING_AFTER_DAYS && !document.declineWarningSentAt) {
            await document.update({ declineWarningSentAt: new Date() });
            const daysLeft = Math.max(1, Math.ceil(VOID_AFTER_DAYS - daysSinceDecline));
            await sendDeclineWarningEmail(document.User.email, document.fileName, daysLeft);
        }
    }
};

const startDeclineExpiryJob = () => {
    cron.schedule('0 0 * * *', () => {
        runDeclineExpiryCheck().catch(err => console.error('[DeclineExpiryJob] Error:', err));
    });
};

module.exports = { startDeclineExpiryJob, runDeclineExpiryCheck };
