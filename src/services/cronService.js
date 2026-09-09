const cron = require('node-cron');
const { Op } = require('sequelize');
const { WorkflowStep, Document, AuditLog, User } = require('../models');
const { sendReminderEmail, sendExpirationEmail } = require('../utils/emailManager');

const startCronJobs = () => {
    console.log('⏳ Cron Jobs Initialized.');

    // Runs at 8:00 AM every day.
    cron.schedule('0 8 * * *', async () => {
        console.log('[Cron] Running daily reminder check...');

        try {
            // 1. REMINDERS CRON JOB
            // Find all workflow steps that are pending AND have an active OTP (meaning it is currently their turn)
            const activeSteps = await WorkflowStep.findAll({
                where: {
                    status: 'pending',
                    otpCode: { [Op.ne]: null } 
                },
                include: [{ 
                    model: Document,
                    where: { status: 'pending' } // Ensure the main document hasn't been voided or completed
                }]
            });

            for (const step of activeSteps) {
                await sendReminderEmail(
                    step.signerEmail,
                    step.signerName,
                    step.accessToken,
                    step.Document.fileName,
                    step.otpCode
                );
            }

            console.log(`[Cron] Successfully sent ${activeSteps.length} reminder emails.`);



            // 2. EXPIRATION HANDLING
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // Find documents pending for more than 7 days
            const expiredDocuments = await Document.findAll({
                where: {
                    status: 'pending',
                    updated_at: { [Op.lt]: sevenDaysAgo } 
                },
                include: [User]
            });

            for (const doc of expiredDocuments) {
                const steps = await WorkflowStep.findAll({ where: { document_id: doc.id } });
                await doc.update({ status: 'voided' }); // Void the main document

                // Void all associated workflow steps
                await WorkflowStep.update(
                    { status: 'voided', otpCode: null, otpExpiresAt: null }, 
                    { where: { document_id: doc.id } }
                );

                // Log the expiration in the Audit Trail
                await AuditLog.create({
                    document_id: doc.id,
                    action: 'DOCUMENT_EXPIRED_AND_VOIDED',
                    actorEmail: 'system@dsign.local',
                    resultingHash: 'SYSTEM_VOID'
                });

                // Gather all emails (Signers + Initiator)
                const stepEmails = steps.map(s => s.signerEmail);
                const initiatorEmail = doc.User.email;
                
                // Deduplicate the list using a Set
                const participantEmails = [...new Set([...stepEmails, initiatorEmail])];

                // Fire the expiration emails
                for (const email of participantEmails) {
                    await sendExpirationEmail(email, doc.fileName);
                }
            }

            if (expiredDocuments.length > 0) {
                console.log(`[Cron] Automatically voided ${expiredDocuments.length} expired documents.`);
            }
        } catch (error) {
            console.error('[Cron] Failed to process reminders:', error);
        }
    });
};

module.exports = { startCronJobs };