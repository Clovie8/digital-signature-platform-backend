const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { Document, WorkflowStep, AuditLog, User, Signature, sequelize } = require('../models');
const { uploadToR2, getPresignedPdfUrl, getFileBufferFromR2, uploadBufferToR2, deleteFromR2 } = require('../utils/s3Manager');
const { sendSignatureEmail, sendCompletionEmail, sendDeclineEmail, sendRevisionEmail, sendRevisionNoticeEmail, sendReminderEmail, sendVoidNotificationEmail, sendReviewReadyEmail } = require('../utils/emailManager');
const { stampDocument, appendAuditTrail } = require('../utils/pdfManager');

const MAX_RESUMES = 3;
const REMINDER_COOLDOWN_MS = 60 * 60 * 1000;

class DocumentService {

    // List Documents (unified inbox: sent by you, or pending on you as a signer)
        async listDocuments(userId, userEmail, isAdmin = false) {
        let documentIds;

        if (isAdmin) {
            const allDocs = await Document.findAll({ attributes: ['id'] });
            documentIds = allDocs.map(d => d.id);
        } else {
            // Step 1: figure out which document ids the user should see at all.
            const sentByYouIds = await Document.findAll({
                where: { initiator_id: userId },
                attributes: ['id']
            });

            const pendingOnYouIds = await Document.findAll({
                where: { status: { [Op.ne]: 'draft' } },
                attributes: ['id'],
                include: [{ model: WorkflowStep, where: { signerEmail: userEmail }, required: true, attributes: [] }]
            });

            documentIds = [...new Set([...sentByYouIds, ...pendingOnYouIds].map(d => d.id))];
        }

        if (documentIds.length === 0) return [];

        // Step 2: fetch those documents with every step fully loaded (unfiltered),
        // so totalSteps/signedSteps/pendingOn are computed from the whole picture,
        // not just the rows that happened to match the membership query above.
        const documents = await Document.findAll({
            where: { id: { [Op.in]: documentIds } },
            include: [{ model: WorkflowStep }, { model: User }],
            order: [['updated_at', 'DESC']]
        });

        return documents.map(document => {
            const steps = document.WorkflowSteps || [];
            const declinedStep = steps.find(s => s.status === 'declined');
            const orderedPendingSteps = steps
                .filter(s => s.status === 'pending')
                .sort((a, b) => a.stepOrder - b.stepOrder);

            return {
                id: document.id,
                fileName: document.fileName,
                status: document.status,
                version: document.version,
                resumeCount: document.resumeCount,
                createdAt: document.created_at,
                updatedAt: document.updated_at,
                totalSteps: steps.length,
                signedSteps: steps.filter(s => s.status === 'completed').length,
                declinedBy: declinedStep ? declinedStep.signerName : null,
                declinedStepOrder: declinedStep ? declinedStep.stepOrder : null,
                initiatorId: document.initiator_id,
                initiatorName: document.User ? document.User.name : null,
                pendingOn: orderedPendingSteps.length ? orderedPendingSteps[0].signerName : null
            };
        });
    }

    // List Pending Approvals (steps waiting on this signer specifically)
    async listPendingForSigner(email) {
        const steps = await WorkflowStep.findAll({
            where: { signerEmail: email, status: 'pending' },
            include: [{ model: Document }],
            order: [['stepOrder', 'ASC']]
        });
        return steps
            .filter(step => step.Document && step.Document.status !== 'draft')
            .map(step => ({
                stepId: step.id,
                documentId: step.document_id,
                documentName: step.Document.fileName,
                stepOrder: step.stepOrder,
                accessToken: step.accessToken
            }));
    }

    // Dashboard Summary (stats + recent activity for the overview page)
    async getDashboardSummary(userId, userEmail) {
        const user = await User.findByPk(userId, { attributes: ['name'] });
        const documents = await this.listDocuments(userId, userEmail);

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

        const myInitiated = documents.filter(d => d.initiatorId === userId);
        const waitingOnYou = await this.listPendingForSigner(userEmail);

        const inProgressDocs = myInitiated.filter(d => ['pending', 'in_progress'].includes(d.status));
        const completedThisMonth = myInitiated.filter(d => d.status === 'completed' && new Date(d.updatedAt) >= startOfMonth);
        const overdueDocs = inProgressDocs.filter(d => new Date(d.createdAt) < fiveDaysAgo);

        const statusBreakdown = {
            awaitingSignature: myInitiated.filter(d => d.status === 'pending').length,
            inProgress: myInitiated.filter(d => d.status === 'in_progress').length,
            completed: myInitiated.filter(d => d.status === 'completed').length,
            voidedRejected: myInitiated.filter(d => ['voided', 'declined'].includes(d.status)).length
        };

        const completedDocs = myInitiated.filter(d => d.status === 'completed');
        const weeks = [];
        for (let i = 5; i >= 0; i--) {
            const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
            const count = completedDocs.filter(d => {
                const t = new Date(d.updatedAt);
                return t >= weekStart && t < weekEnd;
            }).length;
            weeks.push({ week: `Wk ${6 - i}`, value: count });
        }

        const needsAttention = waitingOnYou.map(item => ({
            id: item.stepId,
            title: item.documentName,
            detail: `Step ${item.stepOrder}`,
            accessToken: item.accessToken
        }));

        const myDocIds = myInitiated.map(d => d.id);
        const recentLogs = await AuditLog.findAll({
            where: { document_id: { [Op.in]: myDocIds } },
            order: [['created_at', 'DESC']],
            limit: 5
        });
        const recentActivity = await Promise.all(recentLogs.map(async (log) => {
            const doc = await Document.findByPk(log.document_id);
            return {
                id: log.id,
                action: log.action,
                actorEmail: log.actorEmail,
                documentName: doc ? doc.fileName : 'Untitled document',
                createdAt: log.created_at
            };
        }));

        const documentsInProgress = inProgressDocs.slice(0, 10).map(d => ({
            id: d.id,
            title: d.fileName,
            detail: `Step ${d.signedSteps + 1} of ${d.totalSteps} · waiting on ${d.pendingOn || '—'}`,
            status: d.status
        }));

        return {
            userName: user ? user.name : '',
            stats: {
                waitingOnYou: waitingOnYou.length,
                inProgress: inProgressDocs.length,
                completedThisMonth: completedThisMonth.length,
                overdue: overdueDocs.length
            },
            statusBreakdown,
            completedPerWeek: weeks,
            needsAttention,
            recentActivity,
            documentsInProgress
        };
    }

    // Get Single Document (detail view) — accessible to the initiator or any named signer
        async getDocument(documentId, userId, userEmail, isAdmin = false) {
        const document = await Document.findByPk(documentId, {
            include: [{ model: WorkflowStep }]
        });
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');

        if (!isAdmin) {
            const isInitiator = document.initiator_id === userId;
            const isParticipant = (document.WorkflowSteps || []).some(s => s.signerEmail === userEmail);
            if (!isInitiator && !isParticipant) throw new Error('NOT_OWNER');
        }

        const steps = (document.WorkflowSteps || [])
            .slice()
            .sort((a, b) => a.stepOrder - b.stepOrder);

        const result = {
            id: document.id,
            fileName: document.fileName,
            status: document.status,
            version: document.version,
            resumeCount: document.resumeCount,
            parentDocumentId: document.parent_document_id,
            initiatorId: document.initiator_id,
            createdAt: document.created_at,
            updatedAt: document.updated_at,
            steps: steps.map(step => ({
                id: step.id,
                stepOrder: step.stepOrder,
                signerName: step.signerName,
                signerEmail: step.signerEmail,
                status: step.status,
                declineReason: step.declineReason,
                declineType: step.declineType,
                signedAt: step.signedAt
            }))
        };

        if (isAdmin) {
            const auditLogs = await AuditLog.findAll({
                where: { document_id: documentId },
                order: [['created_at', 'ASC']]
            });
            result.auditLog = auditLogs.map(log => ({
                id: log.id,
                action: log.action,
                actorEmail: log.actorEmail,
                ipAddress: log.ipAddress,
                createdAt: log.created_at
            }));
        }

        return result;
    }

    // Get Version History (walks the parent_document_id chain both directions)
    async getVersionHistory(documentId, userId, userEmail) {
        const document = await Document.findByPk(documentId, {
            include: [{ model: WorkflowStep }]
        });
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');

        const isInitiator = document.initiator_id === userId;
        const isParticipant = (document.WorkflowSteps || []).some(s => s.signerEmail === userEmail);
        if (!isInitiator && !isParticipant) throw new Error('NOT_OWNER');

        // Walk backward to find the root (v1).
        let root = document;
        while (root.parent_document_id) {
            root = await Document.findByPk(root.parent_document_id);
        }

        // Walk forward from the root, collecting every version in order.
        const chain = [];
        let current = root;
        while (current) {
            const declinedStep = await WorkflowStep.findOne({
                where: { document_id: current.id, status: 'declined' }
            });

            chain.push({
                id: current.id,
                version: current.version,
                status: current.status,
                fileName: current.fileName,
                createdAt: current.created_at,
                updatedAt: current.updated_at,
                declinedBy: declinedStep ? declinedStep.signerName : null,
                declineReason: declinedStep ? declinedStep.declineReason : null
            });

            current = await Document.findOne({ where: { parent_document_id: current.id } });
        }

        return chain;
    }

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
        
        //Fetch any saved signatures for this email ---
        const savedSignatures = await Signature.findAll({
            where: { signer_email: step.signerEmail },
            attributes: ['id', 'signature_url']
        });

        //Convert private R2 keys into secure, temporary image URLs ---
        const secureSavedSignatures = await Promise.all(
            savedSignatures.map(async (sig) => {
                return {
                    id: sig.id,
                    originalKey: sig.signature_url, // Sent back to the server upon adoption
                    displayUrl: await getPresignedPdfUrl(sig.signature_url) // Used strictly for frontend display
                };
            })
        );
        
        return {
            pdfUrl: securePdfUrl,
            signer: { id: step.id, name: step.signerName, email: step.signerEmail },
            fields: step.signatureUiData || [],
            savedSignatures: secureSavedSignatures
        };
    }

    // Get Signing View Data
    async getSigningViewData(token, queryOtp, loggedInEmail) {
        const step = await WorkflowStep.findOne({ 
            where: { accessToken: token },
            include: [{ model: Document }] // Eager load the related document
        });

        if (!step) throw new Error('INVALID_LINK');
        if (step.Document.status === 'declined') throw new Error('DOCUMENT_DECLINED');
        if (step.Document.status === 'voided') throw new Error('DOCUMENT_VOIDED');
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
            // Add the lock to the Query
            const step = await WorkflowStep.findOne({ where: { accessToken: token }, transaction, lock: transaction.LOCK.UPDATE });
            
            if (!step) throw new Error('INVALID_STATE');

            // Add the Graceful double-click Reject
            if (step.status === 'completed') {
                console.log(`[Concurrency] Blocked duplicate signature attempt for token: ${token}`);
                await transaction.rollback();

                // Return gracefully so the frontend simply closes the loading screen without crashing
                return { step, document: await Document.findByPk(step.document_id)};
            }

            if (step.status !== 'pending') throw new Error('INVALID_STATE');


            const document = await Document.findByPk(step.document_id, { transaction });

            const targetFileKey = document.signedFilePath || document.originalFilePath;
            const originalBuffer = await getFileBufferFromR2(targetFileKey);

            const fieldsToStamp = updatedFields && updatedFields.length > 0 ? updatedFields : step.signatureUiData;
            const stampedBuffer = await stampDocument(originalBuffer, fieldsToStamp, completedFields);

            const stepHash = crypto.createHash('sha256').update(stampedBuffer).digest('hex');
            const newFileKey = await uploadBufferToR2(stampedBuffer, document.fileName);

            await step.update({ status: 'completed', signedAt: new Date(), stepHash, signatureUiData: fieldsToStamp }, { transaction });
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

    // Decline Signing
    async declineSigning(token, reason, ipAddress) {
        const transaction = await sequelize.transaction();

        try {
            const step = await WorkflowStep.findOne({ where: { accessToken: token }, transaction });
            if (!step || step.status !== 'pending') throw new Error('INVALID_STATE');
            if (!reason || !reason.trim()) throw new Error('MISSING_REASON');

            const document = await Document.findByPk(step.document_id, { include: [User], transaction });

            await step.update({ status: 'declined', declineReason: reason }, { transaction });
            await document.update({ status: 'declined' }, { transaction });

            await AuditLog.create({
                document_id: document.id,
                action: `DECLINED: ${reason}`,
                actorEmail: step.signerEmail,
                ipAddress: ipAddress
            }, { transaction });

            await transaction.commit();

            await sendDeclineEmail(document.User.email, document.fileName, step.signerName, reason);

            return { document };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    // Resume Signing (initiator reopens the declined step, no document edit)
    async resumeDocument(documentId, initiatorId, initiatorEmail, ipAddress) {
        const transaction = await sequelize.transaction();

        try {
            const document = await Document.findByPk(documentId, { transaction });
            if (!document) throw new Error('DOCUMENT_NOT_FOUND');
            if (document.initiator_id !== initiatorId) throw new Error('NOT_OWNER');
            if (document.status !== 'declined') throw new Error('INVALID_STATE');
            if (document.resumeCount >= MAX_RESUMES) throw new Error('RESUME_LIMIT_REACHED');

            const step = await WorkflowStep.findOne({ where: { document_id: documentId, status: 'declined' }, transaction });
            if (!step) throw new Error('INVALID_STATE');

            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const newToken = uuidv4();

            await step.update({
                status: 'pending',
                declineType: 'resumable',
                accessToken: newToken,
                otpCode: otp,
                otpExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            }, { transaction });

            await document.update({ status: 'in_progress', resumeCount: document.resumeCount + 1 }, { transaction });

            await AuditLog.create({
                document_id: document.id,
                action: `RESUMED: step ${step.id}`,
                actorEmail: initiatorEmail,
                ipAddress: ipAddress
            }, { transaction });

            await transaction.commit();

            await sendSignatureEmail(step.signerEmail, step.signerName, newToken, document.fileName, otp);

            return { document };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    // Revise Document (initiator creates a new version, every signer starts over)
    async reviseDocument(documentId, initiatorId, initiatorEmail, ipAddress, newFileBuffer, newFileName) {
        const transaction = await sequelize.transaction();

        try {
            const oldDocument = await Document.findByPk(documentId, { transaction });
            if (!oldDocument) throw new Error('DOCUMENT_NOT_FOUND');
            if (oldDocument.initiator_id !== initiatorId) throw new Error('NOT_OWNER');
            if (oldDocument.status !== 'declined') throw new Error('INVALID_STATE');

            const declinedStep = await WorkflowStep.findOne({ where: { document_id: documentId, status: 'declined' }, transaction });
            if (!declinedStep) throw new Error('INVALID_STATE');

            const oldSteps = await WorkflowStep.findAll({ where: { document_id: documentId }, order: [['stepOrder', 'ASC']], transaction });

            await declinedStep.update({ declineType: 'requires_revision' }, { transaction });
            await oldDocument.update({ status: 'superseded' }, { transaction });

            const newFileKey = newFileBuffer
                ? await uploadToR2(newFileBuffer, newFileName || oldDocument.fileName)
                : oldDocument.originalFilePath;

            const newDocument = await Document.create({
                initiator_id: initiatorId,
                fileName: newFileName || oldDocument.fileName,
                originalFilePath: newFileKey,
                status: 'pending',
                parent_document_id: oldDocument.id,
                version: oldDocument.version + 1
            }, { transaction });

            const newSteps = [];
            for (const oldStep of oldSteps) {
                const newStep = await WorkflowStep.create({
                    document_id: newDocument.id,
                    signerEmail: oldStep.signerEmail,
                    signerName: oldStep.signerName,
                    stepOrder: oldStep.stepOrder,
                    status: 'pending',
                    signatureUiData: oldStep.signatureUiData
                }, { transaction });
                newSteps.push(newStep);
            }

            await AuditLog.create({
                document_id: oldDocument.id,
                action: `SUPERSEDED: replaced by ${newDocument.id}`,
                actorEmail: initiatorEmail,
                ipAddress: ipAddress
            }, { transaction });

            await AuditLog.create({
                document_id: newDocument.id,
                action: `CREATED_FROM_REVISION: ${oldDocument.id}`,
                actorEmail: initiatorEmail,
                ipAddress: ipAddress
            }, { transaction });

            await transaction.commit();

            const firstStep = newSteps[0];
            let isInitiatorFirst = false;

            for (const newStep of newSteps) {
                const isFirst = newStep.id === firstStep.id;

                if (!isFirst) {
                    // Sequential signing still applies: only the first step is actually
                    // reachable right now. Everyone else just gets the transparency notice.
                    await sendRevisionNoticeEmail(newStep.signerEmail, newStep.signerName, newDocument.fileName);
                    continue;
                }

                if (newStep.signerEmail === initiatorEmail) {
                    isInitiatorFirst = true;
                    console.log(`Initiator is Level 1 on the revision. Skipping email. Token: ${newStep.accessToken}`);
                    continue;
                }

                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                await newStep.update({ otpCode: otp, otpExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
                await sendRevisionEmail(newStep.signerEmail, newStep.signerName, newStep.accessToken, newDocument.fileName, otp);
            }

            return { document: newDocument, isInitiatorFirst, redirectToken: isInitiatorFirst ? firstStep.accessToken : null };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    // Void Document (initiator gives up on it)
    async voidDocument(documentId, initiatorId, initiatorEmail, ipAddress) {
        const VOIDABLE_STATUSES = ['draft', 'pending', 'in_progress', 'pending_review', 'declined'];

        const document = await Document.findByPk(documentId);
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');
        if (document.initiator_id !== initiatorId) throw new Error('NOT_OWNER');
        if (!VOIDABLE_STATUSES.includes(document.status)) throw new Error('INVALID_STATE');

        const isDraft = document.status === 'draft';

        if (isDraft) {
            // A draft has no dispatch history worth keeping — this is a real delete,
            // not a void: drop the file and the record itself, nothing to preserve.
            await deleteFromR2(document.originalFilePath);
            await document.destroy();
            return { document, deleted: true };
        }

        const transaction = await sequelize.transaction();
        let stepsToNotify = [];

        try {
            // Cancel the routing queue: nothing still pending should remain reachable.
            stepsToNotify = await WorkflowStep.findAll({
                where: { document_id: documentId, status: 'pending' },
                transaction
            });

            await WorkflowStep.update(
                { status: 'voided', otpCode: null, otpExpiresAt: null },
                { where: { document_id: documentId, status: 'pending' }, transaction }
            );

            await document.update({ status: 'voided' }, { transaction });

            await AuditLog.create({
                document_id: document.id,
                action: 'VOIDED',
                actorEmail: initiatorEmail,
                ipAddress: ipAddress
            }, { transaction });

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        for (const step of stepsToNotify) {
            await sendVoidNotificationEmail(step.signerEmail, step.signerName, document.fileName);
        }

        return { document };
    }

    // Send Reminder (initiator manually nudges the current pending signer)
    async sendReminder(documentId, initiatorId, initiatorEmail, ipAddress) {
        const document = await Document.findByPk(documentId);
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');
        if (document.initiator_id !== initiatorId) throw new Error('NOT_OWNER');
        if (!['pending', 'in_progress'].includes(document.status)) throw new Error('INVALID_STATE');

        const pendingStep = await WorkflowStep.findOne({
            where: { document_id: documentId, status: 'pending' },
            order: [['stepOrder', 'ASC']]
        });
        if (!pendingStep) throw new Error('NO_PENDING_STEP');
        if (pendingStep.signerEmail === initiatorEmail) throw new Error('SELF_SIGNER');

        if (pendingStep.lastReminderSentAt) {
            const elapsed = Date.now() - new Date(pendingStep.lastReminderSentAt).getTime();
            if (elapsed < REMINDER_COOLDOWN_MS) {
                const minutesRemaining = Math.ceil((REMINDER_COOLDOWN_MS - elapsed) / 60000);
                const error = new Error('COOLDOWN_ACTIVE');
                error.minutesRemaining = minutesRemaining;
                throw error;
            }
        }

        let otp = pendingStep.otpCode;
        const otpExpired = !pendingStep.otpExpiresAt || new Date(pendingStep.otpExpiresAt) <= new Date();
        const updates = { lastReminderSentAt: new Date() };

        if (!otp || otpExpired) {
            otp = Math.floor(100000 + Math.random() * 900000).toString();
            updates.otpCode = otp;
            updates.otpExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }

        await pendingStep.update(updates);

        await sendReminderEmail(pendingStep.signerEmail, pendingStep.signerName, pendingStep.accessToken, document.fileName, otp);

        await AuditLog.create({
            document_id: document.id,
            action: `REMINDER_SENT: ${pendingStep.signerEmail}`,
            actorEmail: initiatorEmail,
            ipAddress: ipAddress
        });

        return { signerName: pendingStep.signerName };
    }

    // Get Download URL (initiator or any participant, once the document is finalized)
    async getDownloadUrl(documentId, userId, userEmail) {
        const document = await Document.findByPk(documentId, {
            include: [{ model: WorkflowStep }]
        });
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');

        const isInitiator = document.initiator_id === userId;
        const isParticipant = (document.WorkflowSteps || []).some(s => s.signerEmail === userEmail);
        if (!isInitiator && !isParticipant) throw new Error('NOT_OWNER');

        if (document.status !== 'completed') throw new Error('INVALID_STATE');

        const url = await getPresignedPdfUrl(document.signedFilePath);
        return { url, fileName: document.fileName };
    }

    // Get Draft File (initiator only, for resuming the upload wizard)
    async getDraftFile(documentId, initiatorId) {
        const document = await Document.findByPk(documentId);
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');
        if (document.initiator_id !== initiatorId) throw new Error('NOT_OWNER');

        const url = await getPresignedPdfUrl(document.originalFilePath);
        return { url, fileName: document.fileName, draftConfig: document.draftConfig || null };
    }

    // Save Draft Config (signers + field placements chosen so far, before dispatch)
    async saveDraftConfig(documentId, initiatorId, draftConfig) {
        const document = await Document.findByPk(documentId);
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');
        if (document.initiator_id !== initiatorId) throw new Error('NOT_OWNER');
        if (document.status !== 'draft') throw new Error('INVALID_STATE');

        await document.update({ draftConfig });
        return document;
    }

    // Replace Draft File (initiator only, only while still a draft)
    async replaceDraftFile(documentId, initiatorId, fileBuffer, originalName) {
        const document = await Document.findByPk(documentId);
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');
        if (document.initiator_id !== initiatorId) throw new Error('NOT_OWNER');
        if (document.status !== 'draft') throw new Error('INVALID_STATE');

        const fileKey = await uploadToR2(fileBuffer, originalName);
        await document.update({ originalFilePath: fileKey, fileName: originalName });

        return document;
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
            console.log(`[Workflow] All signatures collected. Awaiting initiator review.`);
            await document.update({ status: 'pending_review' });

            await AuditLog.create({
                document_id: document.id,
                action: 'PENDING_REVIEW',
                actorEmail: 'system@dsign.local'
            });

            const initiator = await User.findByPk(document.initiator_id);
            if (initiator) {
                await sendReviewReadyEmail(initiator.email, document.fileName);
            }
        }
    }

    // Approve Document (initiator reviews the fully-signed document, then seals it)
    async approveDocument(documentId, initiatorId) {
        const document = await Document.findByPk(documentId);
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');
        if (document.initiator_id !== initiatorId) throw new Error('NOT_OWNER');
        if (document.status !== 'pending_review') throw new Error('INVALID_STATE');

        await this.finalizeDocument(documentId);
        await document.reload();
        return { document };
    }

    // Get Review URL (initiator previews the fully-signed, not-yet-sealed document)
    async getReviewUrl(documentId, initiatorId) {
        const document = await Document.findByPk(documentId);
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');
        if (document.initiator_id !== initiatorId) throw new Error('NOT_OWNER');
        if (document.status !== 'pending_review') throw new Error('INVALID_STATE');

        const url = await getPresignedPdfUrl(document.signedFilePath);
        return { url, fileName: document.fileName };
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
            throw error;
        }
    }
}

module.exports = new DocumentService();