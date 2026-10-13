const { Folder, Document, Template, WorkflowStep, AuditLog, sequelize } = require('../models');
const { Op } = require('sequelize');
const { deleteFromR2 } = require('../utils/s3Manager');

class TrashService {

    // Helper: Find all descendant folder IDs recursively
    async getDescendantFolderIds(folderId) {
        const query = `
            WITH RECURSIVE SubFolderTree AS (
                SELECT id FROM "folders" WHERE id = :folderId
                UNION ALL
                SELECT f.id FROM "folders" f
                INNER JOIN SubFolderTree sft ON f.parent_folder_id = sft.id
            )
            SELECT id FROM SubFolderTree;
        `;
        const results = await sequelize.query(query, {
            replacements: { folderId },
            type: sequelize.QueryTypes.SELECT
        });
        return results.map(r => r.id);
    }

    // 1. Move to Trash
    async moveToTrash(itemType, itemId, userId) {
        const now = new Date();

        if (itemType === 'folder') {
            const folder = await Folder.findByPk(itemId);
            if (!folder) throw new Error('FOLDER_NOT_FOUND');
            if (folder.owner_id !== userId) throw new Error('NOT_AUTHORIZED');
            if (folder.trashed_at) throw new Error('ALREADY_TRASHED');

            const allFolderIds = await this.getDescendantFolderIds(itemId);

            const transaction = await sequelize.transaction();
            try {
                // Mark the target folder as root trashed
                await Folder.update(
                    { trashed_at: now, trashed_with_folder_id: null },
                    { where: { id: itemId }, transaction }
                );

                // Mark descendant subfolders as trashed with this parent
                const childFolderIds = allFolderIds.filter(id => id !== itemId);
                if (childFolderIds.length > 0) {
                    await Folder.update(
                        { trashed_at: now, trashed_with_folder_id: itemId },
                        { where: { id: { [Op.in]: childFolderIds } }, transaction }
                    );
                }

                // Mark all documents inside these folders as trashed with this parent
                await Document.update(
                    { trashed_at: now, trashed_with_folder_id: itemId },
                    { where: { folder_id: { [Op.in]: allFolderIds } }, transaction }
                );

                // Void any active documents inside these folders
                const activeDocs = await Document.findAll({
                    where: {
                        folder_id: { [Op.in]: allFolderIds },
                        status: { [Op.in]: ['pending', 'in_progress', 'pending_review'] }
                    },
                    attributes: ['id'],
                    transaction
                });

                if (activeDocs.length > 0) {
                    const activeDocIds = activeDocs.map(d => d.id);
                    await WorkflowStep.update(
                        { status: 'voided', otpCode: null, otpExpiresAt: null },
                        { where: { document_id: { [Op.in]: activeDocIds }, status: 'pending' }, transaction }
                    );
                    await Document.update(
                        { status: 'voided' },
                        { where: { id: { [Op.in]: activeDocIds } }, transaction }
                    );
                    for (const docId of activeDocIds) {
                        await AuditLog.create({
                            document_id: docId,
                            action: 'VOIDED: Parent folder moved to Trash',
                            actorEmail: 'System',
                            ipAddress: 'System'
                        }, { transaction });
                    }
                }

                // Mark all templates inside these folders as trashed with this parent
                await Template.update(
                    { trashed_at: now, trashed_with_folder_id: itemId },
                    { where: { folder_id: { [Op.in]: allFolderIds } }, transaction }
                );

                await transaction.commit();
                return { success: true, message: 'Folder and contents moved to Trash' };
            } catch (err) {
                await transaction.rollback();
                throw err;
            }

        } else if (itemType === 'document') {
            const document = await Document.findByPk(itemId);
            if (!document) throw new Error('DOCUMENT_NOT_FOUND');
            if (document.initiator_id !== userId) throw new Error('NOT_AUTHORIZED');
            if (document.trashed_at) throw new Error('ALREADY_TRASHED');

            const transaction = await sequelize.transaction();
            try {
                // If the document is currently in active signing status, void it
                const ACTIVE_STATUSES = ['pending', 'in_progress', 'pending_review'];
                if (ACTIVE_STATUSES.includes(document.status)) {
                    await WorkflowStep.update(
                        { status: 'voided', otpCode: null, otpExpiresAt: null },
                        { where: { document_id: document.id, status: 'pending' }, transaction }
                    );
                    await Document.update(
                        { status: 'voided' },
                        { where: { id: document.id }, transaction }
                    );
                    await AuditLog.create({
                        document_id: document.id,
                        action: 'VOIDED: Document moved to Trash',
                        actorEmail: 'System',
                        ipAddress: 'System'
                    }, { transaction });
                }

                await Document.update(
                    { trashed_at: now, trashed_with_folder_id: null },
                    { where: { id: itemId }, transaction }
                );

                await transaction.commit();
                return { success: true, message: 'Document moved to Trash' };
            } catch (err) {
                await transaction.rollback();
                throw err;
            }

        } else if (itemType === 'template') {
            const template = await Template.findByPk(itemId);
            if (!template) throw new Error('TEMPLATE_NOT_FOUND');
            if (template.created_by !== userId) throw new Error('NOT_AUTHORIZED');
            if (template.trashed_at) throw new Error('ALREADY_TRASHED');

            await Template.update(
                { trashed_at: now, trashed_with_folder_id: null },
                { where: { id: itemId } }
            );
            return { success: true, message: 'Template moved to Trash' };

        } else {
            throw new Error('INVALID_ITEM_TYPE');
        }
    }

    // 2. Restore Item from Trash
    async restoreItem(itemType, itemId, userId) {
        if (itemType === 'folder') {
            const folder = await Folder.findByPk(itemId);
            if (!folder) throw new Error('FOLDER_NOT_FOUND');
            if (folder.owner_id !== userId) throw new Error('NOT_AUTHORIZED');
            if (!folder.trashed_at) throw new Error('NOT_IN_TRASH');

            const transaction = await sequelize.transaction();
            try {
                // If the parent folder is currently trashed or deleted, restore to root
                let parentFolderId = folder.parent_folder_id;
                if (parentFolderId) {
                    const parent = await Folder.findByPk(parentFolderId, { transaction });
                    if (!parent || parent.trashed_at) {
                        parentFolderId = null;
                    }
                }

                // Restore the folder
                await Folder.update(
                    { trashed_at: null, trashed_with_folder_id: null, parent_folder_id: parentFolderId },
                    { where: { id: itemId }, transaction }
                );

                // Restore all items that were trashed along with this folder
                await Folder.update(
                    { trashed_at: null, trashed_with_folder_id: null },
                    { where: { trashed_with_folder_id: itemId }, transaction }
                );

                await Document.update(
                    { trashed_at: null, trashed_with_folder_id: null },
                    { where: { trashed_with_folder_id: itemId }, transaction }
                );

                await Template.update(
                    { trashed_at: null, trashed_with_folder_id: null },
                    { where: { trashed_with_folder_id: itemId }, transaction }
                );

                await transaction.commit();
                return { success: true, message: 'Folder and contents restored' };
            } catch (err) {
                await transaction.rollback();
                throw err;
            }

        } else if (itemType === 'document') {
            const document = await Document.findByPk(itemId);
            if (!document) throw new Error('DOCUMENT_NOT_FOUND');
            if (document.initiator_id !== userId) throw new Error('NOT_AUTHORIZED');
            if (!document.trashed_at) throw new Error('NOT_IN_TRASH');

            // If the document's folder is currently in trash or deleted, restore to root
            let folderId = document.folder_id;
            if (folderId) {
                const parent = await Folder.findByPk(folderId);
                if (!parent || parent.trashed_at) {
                    folderId = null;
                }
            }

            await Document.update(
                { trashed_at: null, trashed_with_folder_id: null, folder_id: folderId },
                { where: { id: itemId } }
            );

            return { success: true, message: 'Document restored successfully' };

        } else if (itemType === 'template') {
            const template = await Template.findByPk(itemId);
            if (!template) throw new Error('TEMPLATE_NOT_FOUND');
            if (template.created_by !== userId) throw new Error('NOT_AUTHORIZED');
            if (!template.trashed_at) throw new Error('NOT_IN_TRASH');

            let folderId = template.folder_id;
            if (folderId) {
                const parent = await Folder.findByPk(folderId);
                if (!parent || parent.trashed_at) {
                    folderId = null;
                }
            }

            await Template.update(
                { trashed_at: null, trashed_with_folder_id: null, folder_id: folderId },
                { where: { id: itemId } }
            );

            return { success: true, message: 'Template restored successfully' };

        } else {
            throw new Error('INVALID_ITEM_TYPE');
        }
    }

    // 3. List All Trashed Items for a User
    async getTrashContents(userId) {
        // Fetch top-level trashed folders
        const folders = await Folder.findAll({
            where: {
                owner_id: userId,
                trashed_at: { [Op.ne]: null },
                trashed_with_folder_id: null
            },
            order: [['trashed_at', 'DESC']]
        });

        // Fetch top-level trashed documents
        const documents = await Document.findAll({
            where: {
                initiator_id: userId,
                trashed_at: { [Op.ne]: null },
                trashed_with_folder_id: null
            },
            include: [{ model: Folder, as: 'folder', attributes: ['id', 'name'] }],
            order: [['trashed_at', 'DESC']]
        });

        // Fetch top-level trashed templates
        const templates = await Template.findAll({
            where: {
                created_by: userId,
                trashed_at: { [Op.ne]: null },
                trashed_with_folder_id: null
            },
            include: [{ model: Folder, as: 'folder', attributes: ['id', 'name'] }],
            order: [['trashed_at', 'DESC']]
        });

        const computeDaysRemaining = (trashedAt) => {
            const msPassed = Date.now() - new Date(trashedAt).getTime();
            const daysPassed = Math.floor(msPassed / (1000 * 60 * 60 * 24));
            return Math.max(0, 30 - daysPassed);
        };

        const formattedFolders = folders.map(f => ({
            id: f.id,
            name: f.name,
            type: 'folder',
            folderType: f.type,
            trashedAt: f.trashed_at,
            daysRemaining: computeDaysRemaining(f.trashed_at),
            originalLocation: 'Root'
        }));

        const formattedDocuments = documents.map(d => ({
            id: d.id,
            name: d.fileName,
            type: 'document',
            status: d.status,
            trashedAt: d.trashed_at,
            daysRemaining: computeDaysRemaining(d.trashed_at),
            originalLocation: d.folder ? d.folder.name : 'Root'
        }));

        const formattedTemplates = templates.map(t => ({
            id: t.id,
            name: t.name,
            type: 'template',
            trashedAt: t.trashed_at,
            daysRemaining: computeDaysRemaining(t.trashed_at),
            originalLocation: t.folder ? t.folder.name : 'Root'
        }));

        const allItems = [...formattedFolders, ...formattedDocuments, ...formattedTemplates].sort(
            (a, b) => new Date(b.trashedAt) - new Date(a.trashedAt)
        );

        return {
            items: allItems,
            totalCount: allItems.length
        };
    }

    // 4. Permanently Purge a Single Item
    async purgeItem(itemType, itemId, userId) {
        if (itemType === 'folder') {
            const folder = await Folder.findByPk(itemId);
            if (!folder) throw new Error('FOLDER_NOT_FOUND');
            if (folder.owner_id !== userId) throw new Error('NOT_AUTHORIZED');

            const allFolderIds = await this.getDescendantFolderIds(itemId);

            // Clean up files in R2 for all contained documents
            const docs = await Document.findAll({
                where: { folder_id: { [Op.in]: allFolderIds } }
            });
            for (const doc of docs) {
                if (doc.originalFilePath) {
                    try { await deleteFromR2(doc.originalFilePath); } catch (e) { console.error(e); }
                }
                if (doc.signedFilePath) {
                    try { await deleteFromR2(doc.signedFilePath); } catch (e) { console.error(e); }
                }
            }

            // Clean up files in R2 for all contained templates
            const tpls = await Template.findAll({
                where: { folder_id: { [Op.in]: allFolderIds } }
            });
            for (const tpl of tpls) {
                if (tpl.filePath) {
                    try { await deleteFromR2(tpl.filePath); } catch (e) { console.error(e); }
                }
            }

            // Destroy the root folder (Sequelize DB cascade destroys child rows)
            await folder.destroy();
            return { success: true, message: 'Folder permanently deleted' };

        } else if (itemType === 'document') {
            const document = await Document.findByPk(itemId);
            if (!document) throw new Error('DOCUMENT_NOT_FOUND');
            if (document.initiator_id !== userId) throw new Error('NOT_AUTHORIZED');

            if (document.originalFilePath) {
                try { await deleteFromR2(document.originalFilePath); } catch (e) { console.error(e); }
            }
            if (document.signedFilePath) {
                try { await deleteFromR2(document.signedFilePath); } catch (e) { console.error(e); }
            }

            await document.destroy();
            return { success: true, message: 'Document permanently deleted' };

        } else if (itemType === 'template') {
            const template = await Template.findByPk(itemId);
            if (!template) throw new Error('TEMPLATE_NOT_FOUND');
            if (template.created_by !== userId) throw new Error('NOT_AUTHORIZED');

            if (template.filePath) {
                try { await deleteFromR2(template.filePath); } catch (e) { console.error(e); }
            }

            await template.destroy();
            return { success: true, message: 'Template permanently deleted' };

        } else {
            throw new Error('INVALID_ITEM_TYPE');
        }
    }

    // 5. Empty Entire Trash for User
    async emptyTrash(userId) {
        const { items } = await this.getTrashContents(userId);
        for (const item of items) {
            await this.purgeItem(item.type, item.id, userId);
        }
        return { success: true, message: 'Trash emptied successfully' };
    }

    // 6. Automated 30-Day Expiration Background Job
    async autoPurgeExpired() {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        console.log(`[Trash Auto-Purge] Checking items trashed before ${cutoff.toISOString()}...`);

        // 1. Purge expired templates
        const expiredTemplates = await Template.findAll({
            where: { trashed_at: { [Op.lte]: cutoff } }
        });
        for (const tpl of expiredTemplates) {
            if (tpl.filePath) {
                try { await deleteFromR2(tpl.filePath); } catch (e) { console.error(e); }
            }
            await tpl.destroy();
        }

        // 2. Purge expired documents
        const expiredDocuments = await Document.findAll({
            where: { trashed_at: { [Op.lte]: cutoff } }
        });
        for (const doc of expiredDocuments) {
            if (doc.originalFilePath) {
                try { await deleteFromR2(doc.originalFilePath); } catch (e) { console.error(e); }
            }
            if (doc.signedFilePath) {
                try { await deleteFromR2(doc.signedFilePath); } catch (e) { console.error(e); }
            }
            await doc.destroy();
        }

        // 3. Purge expired top-level folders
        const expiredFolders = await Folder.findAll({
            where: {
                trashed_at: { [Op.lte]: cutoff },
                trashed_with_folder_id: null
            }
        });
        for (const folder of expiredFolders) {
            await folder.destroy();
        }

        console.log(`[Trash Auto-Purge] Purged ${expiredFolders.length} folders, ${expiredDocuments.length} documents, ${expiredTemplates.length} templates.`);
        return {
            purgedFolders: expiredFolders.length,
            purgedDocuments: expiredDocuments.length,
            purgedTemplates: expiredTemplates.length
        };
    }
}

module.exports = new TrashService();
