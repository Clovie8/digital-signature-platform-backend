const crypto = require('crypto');
const { WorkflowStep, Document, AuditLog, sequelize } = require('../models');
const { applySignatureToPDF } = require('../utils/pdfManager'); 
const { sendSignatureEmail } = require('../utils/emailManager');

class SignatureService {
    async submit(token, signerIp) {
        // Initialize a Sequelize Transaction to ensure database safety
        const transaction = await sequelize.transaction();

        try {
            // Find the pending step AND include the associated Document
            const currentStep = await WorkflowStep.findOne({
                where: { accessToken: token, status: 'pending' },
                include: [{ model: Document }],
                transaction
            });

            if (!currentStep) {
                throw new Error('INVALID_TOKEN');
            }

            const document = currentStep.Document;

            // Generate the Cryptographic Hash
            const rawData = `${document.id}-${currentStep.signerEmail}-${Date.now()}`;
            const stepHash = crypto.createHash('sha256').update(rawData).digest('hex');

            // PHYSICALLY STAMP THE PDF 
            // (If this fails, the catch block will trigger the database ROLLBACK)
            await applySignatureToPDF(
                document.originalFilePath, 
                currentStep.signerName, 
                currentStep.signatureUiData, 
                stepHash
            );

            // Update workflow_steps
            await currentStep.update({
                status: 'completed',
                signedAt: new Date(),
                signerIp: signerIp,
                stepHash: stepHash
            }, { transaction });

            // Write to Audit Log
            const logAction = `Signed by Level ${currentStep.stepOrder} (${currentStep.signerName})`;
            await AuditLog.create({
                document_id: document.id,
                action: logAction,
                actorEmail: currentStep.signerEmail,
                ipAddress: signerIp,
                resultingHash: stepHash
            }, { transaction });

            // Check for the next signer
            const nextStep = await WorkflowStep.findOne({
                where: { document_id: document.id, stepOrder: currentStep.stepOrder + 1 },
                transaction
            });

            let finalDocumentStatus = 'in_progress';
            let message = 'Signature applied. PDF stamped. Notifying next signer.';

            if (!nextStep) {
                finalDocumentStatus = 'completed';
                message = 'Document fully executed, stamped, and completed.';
                
                await document.update({
                    status: finalDocumentStatus,
                    currentHash: stepHash
                }, { transaction });
            } else {
                // Touch the updated_at timestamp
                await document.update({ updated_at: new Date() }, { transaction });

                // Fire the email to the next person in line (safe to await outside or inside transaction, but usually placed before commit)
                await sendSignatureEmail(nextStep.signerEmail, nextStep.signerName, nextStep.accessToken, document.fileName);
            }

            // Commit all database changes safely
            await transaction.commit();

            return {
                message,
                documentStatus: finalDocumentStatus,
                hashGenerated: stepHash
            };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
}

module.exports = new SignatureService();