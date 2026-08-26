const cron = require('node-cron');
const { Op } = require('sequelize');
const { WorkflowStep, Document } = require('../models');
const { sendReminderEmail } = require('../utils/emailManager');

const startCronJobs = () => {
    console.log('⏳ Cron Jobs Initialized.');

    // This cron expression ('0 8 * * *') runs at 8:00 AM every single day.
    // For testing we use ('*/2 * * * *') to run every 2 minutes.
    cron.schedule('*/2 * * * *', async () => {
        console.log('[Cron] Running daily reminder check...');

        try {
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

            if (activeSteps.length === 0) {
                console.log('[Cron] No pending signatures require reminders today.');
                return;
            }

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

        } catch (error) {
            console.error('[Cron] Failed to process reminders:', error);
        }
    });
};

module.exports = { startCronJobs };