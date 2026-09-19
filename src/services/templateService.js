const { Template, TemplateSigner, Document, WorkflowStep, Signer } = require('../models');
const { uploadBufferToR2, getFileBufferFromR2, getPresignedPdfUrl } = require('../utils/s3Manager');

class TemplateService {

    // List Templates (owned by the user, or shared via prior signing)
    async listTemplates(userId) {
        const templates = await Template.findAll({
            include: [{
                model: TemplateSigner,
                required: false,
                where: { user_id: userId }
            }],
            order: [['created_at', 'DESC']]
        });

        const visible = templates.filter(t =>
            t.created_by === userId || t.TemplateSigners.length > 0
        );

        return visible.map(t => ({
            id: t.id,
            name: t.name,
            signerCount: (t.templateConfig?.signers || []).length,
            usageCount: t.usageCount
        }));
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