const { Document, WorkflowStep, sequelize } = require('../models');
const { sendSignatureEmail } = require('../utils/emailManager');

class WorkflowService {
    async create(documentId, signers, initiatorIsFirstSigner, initiatorId) {
        // Basic Validation
        if (!documentId || !signers || signers.length === 0) {
            throw new Error('MISSING_DATA');
        }

        // Initialize a Sequelize Transaction
        const transaction = await sequelize.transaction();
        let finalSteps;

        try {
            // Verify the document belongs to the user and is still a draft
            const document = await Document.findOne({
                where: { id: documentId, initiator_id: initiatorId, status: 'draft' },
                transaction
            });

            if (!document) {
                throw new Error('DOCUMENT_NOT_FOUND');
            }

            // Loop through the array and insert each signer
            const stepPromises = signers.map((signer, index) => {
                return WorkflowStep.create({
                    document_id: documentId,
                    signerEmail: signer.email,
                    signerName: signer.name,
                    stepOrder: index + 1,
                    status: 'pending'
                }, { transaction });
            });

            await Promise.all(stepPromises);

            //  Update the main document status to pending
            await document.update({ status: 'pending' }, { transaction });

            // Commit Transaction
            await transaction.commit();

            // Fetch the generated steps (with their secure access tokens) ordered correctly
            finalSteps = await WorkflowStep.findAll({
                where: { document_id: documentId },
                order: [['stepOrder', 'ASC']]
            });

            //  EMAIL LOGIC (With newly added Link OTP integration)
            let redirectToken = null;
            
            if (initiatorIsFirstSigner) {
                redirectToken = finalSteps[0].accessToken; 
            } else {
                const firstSigner = finalSteps.find(step => step.stepOrder === 1);
                if (firstSigner) {
                    // Generate Link OTP
                    const otp = Math.floor(100000 + Math.random() * 900000).toString();
                    
                    // Save OTP to DB (no transaction needed here as core workflow is already committed)
                    await firstSigner.update({
                        otpCode: otp,
                        otpExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
                    });

                    // Fire the email asynchronously
                    sendSignatureEmail(
                        firstSigner.signerEmail, 
                        firstSigner.signerName, 
                        firstSigner.accessToken, 
                        document.fileName,
                        otp // Pass the OTP for the Link
                    );
                }
            }

            return {
                message: 'Workflow successfully created',
                documentStatus: 'pending',
                redirectToken,
                steps: finalSteps
            };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
}

module.exports = new WorkflowService();