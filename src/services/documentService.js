const crypto = require('crypto');
const { Document, WorkflowStep, AuditLog, User, sequelize } = require('../models');
const { uploadToR2, getPresignedPdfUrl, getFileBufferFromR2, uploadBufferToR2 } = require('../utils/s3Manager');
const { sendSignatureEmail, sendOTPEmail, sendCompletionEmail } = require('../utils/emailManager');
const { stampDocument, appendAuditTrail } = require('../utils/pdfManager');

class DocumentService {
    
    // Upload Document
    async upload(fileBuffer, originalName, initiatorId) {
        if (!fileBuffer) throw new Error('NO_FILE');
        
        // Upload to Cloudflare R2
        const r2FileKey = await uploadToR2(fileBuffer, originalName);

        // Save to DB using Sequelize
        const document = await Document.create({
            initiator_id: initiatorId, 
            fileName: originalName,
            originalFilePath: r2FileKey,
            status: 'draft'
        });

        return document;
    }

    // Dispatch Document Workflow
    async dispatch(documentId, signers, fields, initiatorEmail, ipAddress) {
        // Use a Sequelize Transaction to ensure atomicity
        const transaction = await sequelize.transaction();

        try {
            const document = await Document.findByPk(documentId, { transaction });
            if (!document) throw new Error('DOCUMENT_NOT_FOUND');

            await document.update({ status: 'pending' }, { transaction });

            let firstSignerToken = null;
            let firstSignerEmail = null;
            let firstSignerName = null;

            // Create Workflow Steps
            for (let i = 0; i < signers.length; i++) {
                const signer = signers[i];
                const stepOrder = i + 1;
                const signerFields = fields ? fields.filter(f => f.signerId === signer.id) : [];

                const step = await WorkflowStep.create({
                    document_id: documentId,
                    signerEmail: signer.email,
                    signerName: signer.name,
                    stepOrder: stepOrder,
                    status: 'pending',
                    signatureUiData: signerFields
                }, { transaction });

                if (stepOrder === 1) {
                    firstSignerToken = step.accessToken;
                    firstSignerEmail = signer.email;
                    firstSignerName = signer.name;
                }
            }

            // Create Audit Log
            await AuditLog.create({
                document_id: documentId,
                action: 'DOCUMENT_DISPATCHED',
                actorEmail: initiatorEmail,
                ipAddress: ipAddress
            }, { transaction });

            await transaction.commit();

            // Conditional Branching (Outside transaction as email sending is an external side-effect)
            let isInitiatorFirst = false;

            if (firstSignerEmail === initiatorEmail) {
                isInitiatorFirst = true;
                console.log(`Initiator is Level 1. Skipping email. Token: ${firstSignerToken}`);
            } else if (firstSignerEmail) {
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                await WorkflowStep.update(
                    { otpCode: otp, otpExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days
                    { where: { accessToken: firstSignerToken } }
                );
                await sendSignatureEmail(firstSignerEmail, firstSignerName, firstSignerToken, document.fileName, otp);
            }

            return { isInitiatorFirst, redirectToken: isInitiatorFirst ? firstSignerToken : null };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    // Release Document For Signing (Zero-Trust Hash Check)
    async releaseDocumentForSigning(step) {
        const document = await Document.findByPk(step.document_id);
        const targetFileKey = document.signedFilePath || document.originalFilePath;

        if (step.stepOrder > 1) {
            const fileBuffer = await getFileBufferFromR2(targetFileKey);
            const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

            if (actualHash !== document.currentHash) {
                throw new Error('INTEGRITY_COMPROMISED');
            }
        }

        const securePdfUrl = await getPresignedPdfUrl(targetFileKey);
        return {
            pdfUrl: securePdfUrl,
            signer: { id: step.id, name: step.signerName, email: step.signerEmail },
            fields: step.signatureUiData || []
        };
    }

    // Get Signing View Data
    async getSigningViewData(token, queryOtp, loggedInEmail) {
        const step = await WorkflowStep.findOne({ 
            where: { accessToken: token },
            include: [{ model: Document }] // Eager load the related document
        });

        if (!step) throw new Error('INVALID_LINK');
        if (step.status !== 'pending') throw new Error('ALREADY_SIGNED');

        const isInitiator = loggedInEmail && loggedInEmail === step.signerEmail;

        if (isInitiator) {
            return await this.releaseDocumentForSigning(step);
        }

        if (queryOtp) {
            if (step.otpCode === queryOtp && new Date(step.otpExpiresAt) > new Date()) {
                return await this.releaseDocumentForSigning(step);
            }
        }

        return { requiresOtp: true };
    }
    
    // Complete Signing
    async completeSigning(token, completedFields, updatedFields, ipAddress) {
        const transaction = await sequelize.transaction();

        try {
            const step = await WorkflowStep.findOne({ where: { accessToken: token }, transaction });
            if (!step || step.status !== 'pending') throw new Error('INVALID_STATE');
            
            const document = await Document.findByPk(step.document_id, { transaction });

            const targetFileKey = document.signedFilePath || document.originalFilePath;
            const originalBuffer = await getFileBufferFromR2(targetFileKey);

            const fieldsToStamp = updatedFields && updatedFields.length > 0 ? updatedFields : step.signatureUiData;
            const stampedBuffer = await stampDocument(originalBuffer, fieldsToStamp, completedFields);

            const stepHash = crypto.createHash('sha256').update(stampedBuffer).digest('hex');
            const newFileKey = await uploadBufferToR2(stampedBuffer, document.fileName);

            await step.update({ status: 'completed', signedAt: new Date(), stepHash }, { transaction });
            await document.update({ signedFilePath: newFileKey, currentHash: stepHash }, { transaction });

            await AuditLog.create({
                document_id: document.id,
                action: 'SIGNED_DOCUMENT',
                actorEmail: step.signerEmail,
                ipAddress: ipAddress,
                resultingHash: stepHash
            }, { transaction });

            await transaction.commit();
            return { step, document }; // Return needed data to controller to trigger next steps

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    // Trigger Next Step or Finalize
    async handleNextWorkflowStep(completedStep, document) {
        const nextStepOrder = completedStep.stepOrder + 1;
        const nextStep = await WorkflowStep.findOne({ where: { document_id: document.id, stepOrder: nextStepOrder } });

        if (nextStep) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            await nextStep.update({ 
                otpCode: otp, 
                otpExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
            });
            await sendSignatureEmail(nextStep.signerEmail, nextStep.signerName, nextStep.accessToken, document.fileName, otp);
            console.log(`[Workflow] Document handed off to Level ${nextStepOrder}: ${nextStep.signerEmail}`);
        } else {
            console.log(`[Workflow] All signatures collected. Triggering Finalization.`);
            await this.finalizeDocument(document.id);
        }
    }

    // Finalize Document
    async finalizeDocument(documentId) {
         try {
            const document = await Document.findByPk(documentId, {
                include: [User] 
            });

            // Fetch audit logs sorted by creation date
            const auditLogs = await AuditLog.findAll({ where: { document_id: documentId }, order: [['created_at', 'ASC']] });

            const targetFileKey = document.signedFilePath || document.originalFilePath;
            const signedBuffer = await getFileBufferFromR2(targetFileKey);

            // Pass plain data objects to the PDF manager
            const plainAuditLogs = auditLogs.map(log => log.get({ plain: true }));
            const finalBuffer = await appendAuditTrail(signedBuffer, plainAuditLogs, document.fileName);

            const masterHash = crypto.createHash('sha256').update(finalBuffer).digest('hex');
            const finalFileKey = await uploadBufferToR2(finalBuffer, `FINAL-${document.fileName}`);

            await document.update({ status: 'completed', signedFilePath: finalFileKey, currentHash: masterHash });

            await AuditLog.create({
                document_id: documentId,
                action: 'DOCUMENT_COMPLETED_AND_SEALED',
                actorEmail: 'system@dsign.local',
                resultingHash: masterHash
            });

            // Email distribution logic
            const steps = await WorkflowStep.findAll({ where: { document_id: documentId } });
            const stepEmails = steps.map(s => s.signerEmail);
            
            // Extract the initiator's email directly from the included User model
            const initiatorEmail = document.User.email;
            
            // Deduplicate the list using a Set
            const participantEmails = [...new Set([...stepEmails, initiatorEmail])];
            const finalSecureLink = await getPresignedPdfUrl(finalFileKey);

            for (const email of participantEmails) {
                await sendCompletionEmail(email, document.fileName, finalSecureLink);
                console.log(`[Workflow] Final document emailed to: ${email}`);
            }
        } catch (error) {
            console.error('[Workflow] Finalization Error:', error);
        }
    }
}

module.exports = new DocumentService();