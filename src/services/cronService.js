const cron = require('node-cron');
const { Op } = require('sequelize');
const { WorkflowStep, Document, AuditLog, User } = require('../models');
const { sendReminderEmail, sendOverdueEmail } = require('../utils/emailManager');

const startCronJobs = () => {
    console.log('⏳ Cron Jobs Initialized.');

    // Runs every 30 minutes.
    cron.schedule('*/30 * * * *', async () => {
        console.log('[Cron] Running 30-minute reminder and expiration check...');

        try {
            const now = new Date();

            // 1. REMINDERS CRON JOB
            const activeSteps = await WorkflowStep.findAll({
                where: {
                    status: 'pending',
                    accessToken: { [Op.ne]: null } 
                },
                include: [{ 
                    model: Document,
                    where: { status: 'pending' }
                }]
            });

            let remindersSent = 0;

            for (const step of activeSteps) {
                const doc = step.Document;
                let shouldSend = false;
                let hoursLeft = null;
                
                const hoursSinceLastReminder = step.lastReminderSentAt 
                    ? (now - new Date(step.lastReminderSentAt)) / (1000 * 60 * 60) 
                    : Infinity;

                if (!doc.dueDate) {
                    // No Due Date: Send daily (every 24 hours)
                    if (hoursSinceLastReminder >= 24) {
                        shouldSend = true;
                    }
                } else {
                    const dueDate = new Date(doc.dueDate);
                    hoursLeft = (dueDate - now) / (1000 * 60 * 60);

                    if (hoursLeft > 24) {
                        // > 24 hours away: send at ~72 hours (3 days) and ~24 hours (1 day) marks
                        if (hoursSinceLastReminder >= 24) {
                            if (hoursLeft <= 72 && hoursLeft > 48) {
                                shouldSend = true; // 3-day mark
                            } else if (hoursLeft <= 24) {
                                shouldSend = true; // 1-day mark
                            }
                        }
                    } else if (hoursLeft > 4 && hoursLeft <= 24) {
                        // Between 4 and 24 hours: Send one reminder every 4 hours
                        if (hoursSinceLastReminder >= 4) {
                            shouldSend = true;
                        }
                    } else if (hoursLeft > 0 && hoursLeft <= 4) {
                        // Final Countdown (Under 4 hours)
                        if (hoursLeft <= 2.5 && hoursLeft > 1.5) {
                            // ~2 hour mark
                            if (hoursSinceLastReminder >= 2) {
                                shouldSend = true;
                            }
                        } else if (hoursLeft <= 0.5) {
                            // ~30 minute mark (Final Warning)
                            if (hoursSinceLastReminder >= 1) {
                                shouldSend = true;
                            }
                        }
                    }
                    // If hoursLeft <= 0, we don't send reminder, we handle it in the overdue step.
                }

                if (shouldSend) {
                    await sendReminderEmail(
                        step.signerEmail,
                        step.signerName,
                        step.accessToken,
                        doc.fileName,
                        step.otpCode,
                        hoursLeft
                    );
                    
                    await step.update({ lastReminderSentAt: now });
                    remindersSent++;
                }
            }

            if (remindersSent > 0) {
                console.log(`[Cron] Successfully sent ${remindersSent} reminder emails.`);
            }

            // 2. OVERDUE HANDLING
            const overdueDocuments = await Document.findAll({
                where: {
                    status: 'pending',
                    dueDate: { [Op.ne]: null, [Op.lt]: now }
                },
                include: [User]
            });

            let overdueNoticesSent = 0;

            for (const doc of overdueDocuments) {
                // Check if we already sent the overdue notification for this document
                const existingLog = await AuditLog.findOne({
                    where: {
                        document_id: doc.id,
                        action: 'OVERDUE_NOTIFICATION_SENT'
                    }
                });

                if (!existingLog) {
                    const steps = await WorkflowStep.findAll({ where: { document_id: doc.id } });
                    
                    // Log the overdue notification in the Audit Trail
                    await AuditLog.create({
                        document_id: doc.id,
                        action: 'OVERDUE_NOTIFICATION_SENT',
                        actorEmail: 'system@dsign.local'
                    });

                    // Gather all emails (Signers + Initiator)
                    const stepEmails = steps.map(s => s.signerEmail);
                    const initiatorEmail = doc.User.email;
                    const participantEmails = [...new Set([...stepEmails, initiatorEmail])];

                    // Fire the overdue emails
                    for (const email of participantEmails) {
                        await sendOverdueEmail(email, doc.fileName);
                    }
                    overdueNoticesSent++;
                }
            }

            if (overdueNoticesSent > 0) {
                console.log(`[Cron] Marked ${overdueNoticesSent} documents as overdue and sent notifications.`);
            }
        } catch (error) {
            console.error('[Cron] Failed to process reminders/expiration:', error);
        }
    });
};

module.exports = { startCronJobs };