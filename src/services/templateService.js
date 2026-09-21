const { Template, TemplateSigner, Document, WorkflowStep, Signer } = require('../models');
const { uploadBufferToR2, getFileBufferFromR2, getPresignedPdfUrl, deleteFromR2 } = require('../utils/s3Manager');

class TemplateService {

    // List Templates (owned by the user, shared via prior signing, or in accessible folders)
    async listTemplates(userId) {
        const { Op } = require('sequelize');
        
        // 1. Get all accessible folders
        const folderService = require('./folderService');
        const accessibleFolders = await folderService.getAllFolders(userId);
        const folderIds = accessibleFolders.map(f => f.id);

        // 2. Get templates shared via TemplateSigner
        const sharedSignerTemplates = await TemplateSigner.findAll({
            where: { user_id: userId },
            attributes: ['template_id']
        });
        const sharedTemplateIds = sharedSignerTemplates.map(t => t.template_id);

        const templates = await Template.findAll({
            where: {
                [Op.or]: [
                    { created_by: userId },
                    { id: { [Op.in]: sharedTemplateIds } },
                    { folder_id: { [Op.in]: folderIds } }
                ]
            },
            order: [['created_at', 'DESC']]
        });

        return templates.map(t => ({
            id: t.id,
            name: t.name,
            fileName: t.fileName,
            folder_id: t.folder_id,
            signerCount: (t.templateConfig?.signers || []).length,
            usageCount: t.usageCount,
            createdAt: t.created_at,
            updatedAt: t.updated_at
        }));
    }

    async getTemplate(templateId, userId) {
        const template = await Template.findByPk(templateId, {
            include: [{ model: TemplateSigner, required: false, where: { user_id: userId } }]
        });
        if (!template) throw new Error('TEMPLATE_NOT_FOUND');

        // Note: access control logic should also check folder access in a full implementation.
        // For now, we enforce owner or shared signers.
        const hasAccess = template.created_by === userId || template.TemplateSigners.length > 0;
        
        if (!hasAccess) {
            // Also check folder access
            const folderService = require('./folderService');
            const folders = await folderService.getAllFolders(userId);
            const folderIds = folders.map(f => f.id);
            if (!template.folder_id || !folderIds.includes(template.folder_id)) {
                throw new Error('FORBIDDEN');
            }
        }
        
        return {
            id: template.id,
            name: template.name,
            fileName: template.fileName,
            folder_id: template.folder_id,
            templateConfig: template.templateConfig,
            usageCount: template.usageCount,
            status: 'template', // pseudo status for frontend
            createdAt: template.created_at,
            updatedAt: template.updated_at
        };
    }

    async getTemplateDownloadUrl(templateId, userId) {
        const templateModel = await Template.findByPk(templateId, {
            include: [{ model: TemplateSigner, required: false, where: { user_id: userId } }]
        });
        if (!templateModel) throw new Error('TEMPLATE_NOT_FOUND');
        
        const hasAccess = templateModel.created_by === userId || templateModel.TemplateSigners.length > 0;
        if (!hasAccess) {
            const folderService = require('./folderService');
            const folders = await folderService.getAllFolders(userId);
            const folderIds = folders.map(f => f.id);
            if (!templateModel.folder_id || !folderIds.includes(templateModel.folder_id)) {
                throw new Error('FORBIDDEN');
            }
        }

        const url = await getPresignedPdfUrl(templateModel.filePath);
        return { url, fileName: templateModel.fileName };
    }

    // Use Template (clone its file + field layout into a new draft document)
    async useTemplate(templateId, userId) {
        const template = await Template.findByPk(templateId, {
            include: [{ model: TemplateSigner, required: false, where: { user_id: userId } }]
        });
        if (!template) throw new Error('TEMPLATE_NOT_FOUND');

        const hasAccess = template.created_by === userId || template.TemplateSigners.length > 0;
        if (!hasAccess) throw new Error('FORBIDDEN');

        const fileBuffer = await getFileBufferFromR2(template.filePath);
        const newFileKey = await uploadBufferToR2(fileBuffer, template.fileName);

        const signers = (template.templateConfig?.signers || []).map(s => ({ ...s, name: '', email: '' }));
        const fields = template.templateConfig?.fields || [];

        const document = await Document.create({
            initiator_id: userId,
            template_id: template.id,
            fileName: template.fileName,
            originalFilePath: newFileKey,
            status: 'draft',
            draftConfig: { signers, fields, currentStep: 2 }
        });

        await template.increment('usageCount');

        const fileUrl = await getPresignedPdfUrl(newFileKey);

        return {
            document: {
                id: document.id,
                fileUrl,
                fileName: document.fileName,
                templateName: template.name
            },
            signers,
            fields
        };
    }

    // Save As Template (snapshot a document's current file + field layout)
    async saveAsTemplate(documentId, userId, name) {
        if (!name || !name.trim()) throw new Error('MISSING_NAME');

        const document = await Document.findByPk(documentId);
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');
        if (document.initiator_id !== userId) throw new Error('NOT_OWNER');

        const sourceFileKey = document.signedFilePath || document.originalFilePath;
        const fileBuffer = await getFileBufferFromR2(sourceFileKey);
        const newFileKey = await uploadBufferToR2(fileBuffer, document.fileName);

        const sourceSigners = document.draftConfig?.signers || [];
        const sourceFields = document.draftConfig?.fields || [];

        const templateSigners = sourceSigners.map(s => ({
            role: s.role,
            color: s.color,
            order: s.id
        }));

        const template = await Template.create({
            name: name.trim(),
            created_by: userId,
            fileName: document.fileName,
            filePath: newFileKey,
            templateConfig: { signers: templateSigners, fields: sourceFields }
        });

        return template;
    }

    // Upload Template Directly (bypassing dispatch)
    async uploadTemplateDirectly(userId, fileBuffer, originalName) {
        const newFileKey = await uploadBufferToR2(fileBuffer, originalName);
        
        let templateName = originalName;
        if (templateName.toLowerCase().endsWith('.pdf')) {
            templateName = templateName.slice(0, -4);
        }

        const template = await Template.create({
            name: templateName,
            created_by: userId,
            fileName: originalName,
            filePath: newFileKey,
            templateConfig: { signers: [], fields: [] }
        });

        return template;
    }

    // Delete Template
    async deleteTemplate(templateId, userId) {
        const template = await Template.findByPk(templateId);
        if (!template) throw new Error('TEMPLATE_NOT_FOUND');
        if (template.created_by !== userId) throw new Error('NOT_OWNER');

        // Delete from R2 storage
        try {
            await deleteFromR2(template.filePath);
        } catch (err) {
            console.error('Failed to delete template file from R2:', err);
        }

        // Delete from database
        await template.destroy();
        return true;
    }

    // Grant Template Access (called after a document made from a template completes,
    // so everyone who signed it can reuse the template going forward)
    async grantAccessToCompletedSigners(documentId) {
        const document = await Document.findByPk(documentId);
        if (!document || !document.template_id) return;

        const steps = await WorkflowStep.findAll({ where: { document_id: documentId } });

        const signerUserIds = await Promise.all(
            steps.map(async (step) => {
                const signer = await Signer.findOne({ where: { email: step.signerEmail } });
                return signer?.user_id || null;
            })
        );

        await Promise.all(
            signerUserIds
                .filter(Boolean)
                .map(userId =>
                    TemplateSigner.findOrCreate({
                        where: { template_id: document.template_id, user_id: userId }
                    })
                )
        );
    }
}

module.exports = new TemplateService();