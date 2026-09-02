const { Op } = require('sequelize');
const { User, AuditLog, Document } = require('../models');

class AdminService {
    async listUsers() {
        const users = await User.findAll({
            attributes: ['id', 'name', 'email', 'role', 'isVerified', 'created_at'],
            order: [['created_at', 'DESC']]
        });

        return users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            status: u.isVerified ? 'active' : 'invited',
            createdAt: u.created_at
        }));
    }

    async listAuditLogs(filters) {
        const { page = 1, limit = 25, action, actorEmail, documentId, startDate, endDate } = filters;

        const where = {};
        if (action) where.action = { [Op.iLike]: `%${action}%` };
        if (actorEmail) where.actorEmail = { [Op.iLike]: `%${actorEmail}%` };
        if (documentId) where.document_id = documentId;
        if (startDate || endDate) {
            where.created_at = {};
            if (startDate) where.created_at[Op.gte] = new Date(startDate);
            if (endDate) where.created_at[Op.lte] = new Date(endDate);
        }

        const offset = (page - 1) * limit;

        const { rows, count } = await AuditLog.findAndCountAll({
            where,
            include: [{ model: Document, attributes: ['fileName'], required: false }],
            order: [['created_at', 'DESC']],
            limit: Number(limit),
            offset
        });

        return {
            logs: rows.map(log => ({
                id: log.id,
                action: log.action,
                actorEmail: log.actorEmail,
                ipAddress: log.ipAddress,
                documentId: log.document_id,
                documentName: log.Document ? log.Document.fileName : null,
                createdAt: log.created_at
            })),
            pagination: {
                total: count,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(count / limit)
            }
        };
    }
}

module.exports = new AdminService();