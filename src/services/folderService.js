const { Folder, FolderAccess, Document, User, Template, TemplateSigner, sequelize } = require('../models');

class FolderService {
    // 1. Get Effective Role using Recursive CTE
    async getEffectiveRole(folderId, userId, isAdmin) {
        if (isAdmin) return 'manager';
        
        const folder = await Folder.findByPk(folderId);
        if (!folder) throw new Error('FOLDER_NOT_FOUND');
        if (folder.owner_id === userId) return 'manager';

        // Get all inherited accesses
        const query = `
            WITH RECURSIVE FolderPath AS (
                SELECT id, parent_folder_id, is_public FROM "folders" WHERE id = :folderId
                UNION ALL
                SELECT f.id, f.parent_folder_id, f.is_public FROM "folders" f
                INNER JOIN FolderPath fp ON f.id = fp.parent_folder_id
            )
            SELECT fa.role, fp.is_public FROM FolderPath fp
            LEFT JOIN folder_accesses fa ON fa.folder_id = fp.id AND fa.user_id = :userId
        `;
        
        const results = await sequelize.query(query, {
            replacements: { folderId, userId },
            type: sequelize.QueryTypes.SELECT
        });

        const roleWeights = { 'viewer': 1, 'editor': 2, 'manager': 3 };
        let maxWeight = 0;
        let maxRole = null;
        let isPublic = false;

        for (const r of results) {
            if (r.is_public) isPublic = true;
            if (r.role && roleWeights[r.role] > maxWeight) {
                maxWeight = roleWeights[r.role];
                maxRole = r.role;
            }
        }
        
        if (maxRole) return maxRole;
        if (isPublic) return 'viewer';
        return null;
    }

    // 2. Create Folder
    async createFolder(name, parentId, userId) {
        if (parentId) {
            const role = await this.getEffectiveRole(parentId, userId, false);
            if (role !== 'editor' && role !== 'manager') {
                throw new Error('NO_WRITE_ACCESS');
            }
        }
        
        const folder = await Folder.create({
            name,
            owner_id: userId,
            parent_folder_id: parentId || null
        });
        return folder;
    }

    // 3. Get Directory Contents
    async getDirectoryContents(folderId, userId, isAdmin) {
        let role = 'manager';
        
        if (folderId) {
            role = await this.getEffectiveRole(folderId, userId, isAdmin);
            if (!role) throw new Error('ACCESS_DENIED');
        }

        const { Op } = require('sequelize');
        
        let folders = [];
        if (folderId) {
            folders = await Folder.findAll({
                where: { parent_folder_id: folderId },
                order: [['created_at', 'DESC']]
            });
        } else {
            // Root level: owned root folders + all explicitly shared folders
            const owned = await Folder.findAll({
                where: { parent_folder_id: null, owner_id: userId }
            });
            
            const sharedAccess = await FolderAccess.findAll({
                where: { user_id: userId },
                attributes: ['folder_id']
            });
            const sharedFolderIds = sharedAccess.map(a => a.folder_id);
            
            let shared = [];
            if (sharedFolderIds.length > 0) {
                shared = await Folder.findAll({
                    where: { id: { [Op.in]: sharedFolderIds } }
                });
            }
            
            const folderMap = new Map();
            owned.forEach(f => folderMap.set(f.id, f));
            shared.forEach(f => folderMap.set(f.id, f));
            
            folders = Array.from(folderMap.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        const foldersWithRoles = [];
        for (const f of folders) {
            const fRole = await this.getEffectiveRole(f.id, userId, isAdmin);
            foldersWithRoles.push({
                ...f.toJSON(),
                access_role: fRole
            });
        }
        
        const userObj = await sequelize.models.User.findByPk(userId);
        const userEmail = userObj ? userObj.email : '';
        
        let docWhere = {};
        if (isAdmin) {
            if (folderId) {
                docWhere = { folder_id: folderId };
            } else {
                docWhere = { folder_id: null };
            }
        } else {
            const sentByYouIds = await Document.findAll({
                  where: { initiator_id: userId, folder_id: folderId || null },
                  attributes: ['id']
            });
            const pendingOnYouIds = await Document.findAll({
                  where: { folder_id: folderId || null, status: { [Op.ne]: 'draft' } },
                  attributes: ['id'],
                  include: [{ model: sequelize.models.WorkflowStep, where: { signerEmail: userEmail }, required: true, attributes: [] }]
            });
            const documentIds = [...new Set([...sentByYouIds, ...pendingOnYouIds].map(d => d.id))];
            
            docWhere = { id: { [Op.in]: documentIds } };
        }

        

        const docs = await Document.findAll({
            where: docWhere,
            include: [{ model: sequelize.models.WorkflowStep }, { model: sequelize.models.User }],
            order: [['updated_at', 'DESC']]
        });

        let templateWhere = {};
        if (folderId) {
            templateWhere = { folder_id: folderId };
        } else {
            // Root level: templates created by user and not in a folder, PLUS templates shared with user
            // Wait, templates are either created_by the user, or the user is in TemplateSigner.
            // And folder_id must be null for root level.
            // Wait, if a template is in a shared folder, we handle it in `folderId != null`.
            // So for root level, we just get root templates.
            const createdWhere = { created_by: userId, folder_id: null };
            
            // Also templates shared directly via TemplateSigner (if any) and in root?
            // Actually let's fetch like listTemplates does, but only those in root.
            const sharedTemplateIdsRes = await sequelize.models.TemplateSigner.findAll({
                where: { user_id: userId },
                attributes: ['template_id']
            });
            const sharedTemplateIds = sharedTemplateIdsRes.map(ts => ts.template_id);
            
            templateWhere = {
                folder_id: null,
                [Op.or]: [
                    { created_by: userId },
                    { id: { [Op.in]: sharedTemplateIds } }
                ]
            };
        }

        const templates = await Template.findAll({
            where: templateWhere,
            include: [{ model: sequelize.models.User }],
            order: [['updated_at', 'DESC']]
        });



        const documents = docs.map(document => {
            const steps = document.WorkflowSteps || [];
            const declinedStep = steps.find(s => s.status === 'declined');
            const orderedPendingSteps = steps
                .filter(s => s.status === 'pending')
                .sort((a, b) => a.stepOrder - b.stepOrder);

            const activeStep = orderedPendingSteps.length ? orderedPendingSteps[0] : null;

            const hasSigned = steps.some(s => s.status === 'completed' && s.signerEmail === userEmail);

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
                declinedStep: declinedStep ? {
                    signerName: declinedStep.signerName,
                    declineReason: declinedStep.declineReason,
                    updatedAt: declinedStep.updated_at
                } : null,
                activeStep: activeStep ? {
                    signerName: activeStep.signerName
                } : null,
                hasSigned,
                initiatorId: document.initiator_id,
                initiatorName: document.User ? document.User.name : 'Unknown',
                steps: steps.map(s => ({
                    id: s.id,
                    signerName: s.signerName,
                    signerEmail: s.signerEmail,
                    status: s.status,
                    stepOrder: s.stepOrder,
                    updatedAt: s.updated_at,
                    declineReason: s.declineReason
                }))
            };
        });

        const formattedTemplates = templates.map(template => ({
            id: template.id,
            name: template.name,
            fileName: template.fileName,
            usageCount: template.usageCount,
            createdAt: template.created_at,
            updatedAt: template.updated_at,
            created_by: template.created_by,
            creatorName: template.User ? template.User.name : 'Unknown'
        }));

        return { folders: foldersWithRoles, documents, templates: formattedTemplates, currentRole: role };
    }

    // 4. Move Item (File or Folder)
    
    async moveBulkItems(items, destinationFolderId, userId, isAdmin) {
        const results = [];
        // Sequential for simplicity and avoiding deadlock
        for (const item of items) {
            try {
                const movedItem = await this.moveItem(item.id, item.type, destinationFolderId, userId, isAdmin);
                results.push({ id: item.id, type: item.type, success: true });
            } catch (err) {
                results.push({ id: item.id, type: item.type, success: false, error: err.message });
            }
        }
        return results;
    }

    async moveItem(itemId, itemType, destinationFolderId, userId, isAdmin) {
        // Destination check
        if (destinationFolderId) {
            const destRole = await this.getEffectiveRole(destinationFolderId, userId, isAdmin);
            if (destRole !== 'editor' && destRole !== 'manager') throw new Error('NO_WRITE_ACCESS_DESTINATION');
        }

        if (itemType === 'folder') {
            const folder = await Folder.findByPk(itemId);
            if (!folder) throw new Error('FOLDER_NOT_FOUND');
            const sourceRole = await this.getEffectiveRole(folder.id, userId, isAdmin);
            if (sourceRole !== 'manager' && sourceRole !== 'editor') throw new Error('NO_WRITE_ACCESS_SOURCE');
            
            // Prevent circular dependency (destination cannot be a child of this folder)
            if (destinationFolderId) {
                const circularQuery = `
                    WITH RECURSIVE FolderPath AS (
                        SELECT id, parent_folder_id FROM "folders" WHERE id = :destinationId
                        UNION ALL
                        SELECT f.id, f.parent_folder_id FROM "folders" f
                        INNER JOIN FolderPath fp ON f.id = fp.parent_folder_id
                    )
                    SELECT id FROM FolderPath WHERE id = :sourceId
                `;
                const circularResults = await sequelize.query(circularQuery, {
                    replacements: { destinationId: destinationFolderId, sourceId: itemId },
                    type: sequelize.QueryTypes.SELECT
                });
                if (circularResults.length > 0) throw new Error('CIRCULAR_DEPENDENCY');
            }

            folder.parent_folder_id = destinationFolderId || null;
            await folder.save();
            return folder;

        } else if (itemType === 'document') {
            const document = await Document.findByPk(itemId);
            if (!document) throw new Error('DOCUMENT_NOT_FOUND');
            // If the document is inside a folder, check source folder access
            if (document.folder_id) {
                const sourceRole = await this.getEffectiveRole(document.folder_id, userId, isAdmin);
                if (sourceRole !== 'manager' && sourceRole !== 'editor') throw new Error('NO_WRITE_ACCESS_SOURCE');
            } else {
                if (!isAdmin && document.initiator_id !== userId) throw new Error('NOT_OWNER');
            }

            document.folder_id = destinationFolderId || null;
            await document.save();
            return document;
        } else if (itemType === 'template') {
            const template = await Template.findByPk(itemId);
            if (!template) throw new Error('TEMPLATE_NOT_FOUND');
            if (template.folder_id) {
                const sourceRole = await this.getEffectiveRole(template.folder_id, userId, isAdmin);
                if (sourceRole !== 'manager' && sourceRole !== 'editor') throw new Error('NO_WRITE_ACCESS_SOURCE');
            } else {
                if (!isAdmin && template.created_by !== userId) throw new Error('NOT_OWNER');
            }

            template.folder_id = destinationFolderId || null;
            await template.save();
            return template;
        } else {
            throw new Error('INVALID_ITEM_TYPE');
        }
    }

    async getAllFolders(userId, isAdmin = false, parentId = undefined) {
        let accessibleFolderIds = [];
        if (isAdmin) {
            const allFolders = await Folder.findAll({ attributes: ['id'] });
            accessibleFolderIds = allFolders.map(f => f.id);
        } else {
            const query = `
                WITH RECURSIVE AccessibleFolders AS (
                    SELECT f.id, f.parent_folder_id 
                    FROM "folders" f
                    LEFT JOIN folder_accesses fa ON f.id = fa.folder_id
                    WHERE f.owner_id = :userId OR fa.user_id = :userId OR f.is_public = true
                    
                    UNION ALL
                    
                    SELECT child.id, child.parent_folder_id
                    FROM "folders" child
                    INNER JOIN AccessibleFolders af ON child.parent_folder_id = af.id
                )
                SELECT DISTINCT id FROM AccessibleFolders;
            `;
            const results = await sequelize.query(query, {
                replacements: { userId },
                type: sequelize.QueryTypes.SELECT
            });
            accessibleFolderIds = results.map(r => r.id);
        }

        const { Op } = require('sequelize');
        const whereClause = { id: { [Op.in]: accessibleFolderIds } };
        if (parentId !== undefined) {
            whereClause.parent_folder_id = parentId === 'null' ? null : parentId;
        }

        const folders = await Folder.findAll({
            where: whereClause,
            order: [['name', 'ASC']]
        });
        
        const foldersWithRoles = [];
        for (const f of folders) {
            const fRole = await this.getEffectiveRole(f.id, userId, isAdmin);
            foldersWithRoles.push({
                ...f.toJSON(),
                access_role: fRole
            });
        }
    
        return foldersWithRoles;
    }


    async getFolderAccess(folderId, userId, isAdmin) {
        const folder = await Folder.findByPk(folderId);
        if (!folder) throw new Error('Folder not found');
        
        const currentRole = await this.getEffectiveRole(folderId, userId, isAdmin);
        if (!currentRole && !isAdmin && folder.owner_id !== userId) {
            throw new Error('Not authorized to view access');
        }

        // We will return access list from the db
        const accessList = await FolderAccess.findAll({
            where: { folder_id: folderId },
            include: [{ model: User, attributes: ['id', 'name', 'email'] }]
        });
        
        return {
            owner_id: folder.owner_id,
            is_public: folder.is_public,
            access: accessList.map(a => ({
                userId: a.User.id,
                username: a.User.name,
                email: a.User.email,
                role: a.role,
                inherited: false // For Phase 3, simplified
            }))
        };
    }

    async updateFolderAccess(folderId, targetUserId, role, currentUserId, isAdmin) {
        const folder = await Folder.findByPk(folderId);
        if (!folder) throw new Error('Folder not found');
        
        const currentRole = await this.getEffectiveRole(folderId, currentUserId, isAdmin);
        if (currentRole !== 'manager' && folder.owner_id !== currentUserId && !isAdmin) {
            throw new Error('Not authorized to modify access');
        }

        if (role === 'remove') {
            await FolderAccess.destroy({ where: { folder_id: folderId, user_id: targetUserId } });
        } else {
            const [access, created] = await FolderAccess.findOrCreate({
                where: { folder_id: folderId, user_id: targetUserId },
                defaults: { role }
            });
            if (!created) {
                access.role = role;
                await access.save();
            }
        }
        return { success: true };
    }

    async updatePublicStatus(folderId, isPublic, currentUserId, isAdmin) {
        const folder = await Folder.findByPk(folderId);
        if (!folder) throw new Error('FOLDER_NOT_FOUND');
        
        const currentRole = await this.getEffectiveRole(folderId, currentUserId, isAdmin);
        if (currentRole !== 'manager' && folder.owner_id !== currentUserId && !isAdmin) {
            throw new Error('NOT_AUTHORIZED');
        }

        folder.is_public = isPublic;
        await folder.save();
        return { success: true, is_public: folder.is_public };
    }

    async renameFolder(userId, folderId, newName) {
        const folder = await Folder.findByPk(folderId);
        if (!folder) throw new Error('FOLDER_NOT_FOUND');
        
        const role = await this.getEffectiveRole(folderId, userId, false);
        if (role !== 'manager' && folder.owner_id !== userId) {
            throw new Error('NO_WRITE_ACCESS');
        }
        
        folder.name = newName;
        await folder.save();
        return folder;
    }

    async deleteFolder(folderId, userId, isAdmin) {
        const folder = await Folder.findByPk(folderId);
        if (!folder) throw new Error('FOLDER_NOT_FOUND');
        
        const role = await this.getEffectiveRole(folderId, userId, isAdmin);
        if (role !== 'manager' && folder.owner_id !== userId && !isAdmin) {
            throw new Error('NOT_AUTHORIZED_TO_DELETE');
        }
        
        await folder.destroy();
        return { success: true };
    }
}

module.exports = new FolderService();
