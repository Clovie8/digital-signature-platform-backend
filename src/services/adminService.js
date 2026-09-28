const { Op } = require('sequelize');
const { User, AuditLog, Document } = require('../models');
const { sendInvitationEmail, sendAccountDeactivatedEmail, sendAccountReactivatedEmail } = require('../utils/emailManager');

class AdminService {
    async listUsers() {
        const users = await User.findAll({
            attributes: ['id', 'name', 'email', 'role', 'isVerified', 'isActive', 'created_at'],
            order: [['created_at', 'DESC']]
        });

        return users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            status: !u.isActive ? 'deactivated' : (u.isVerified ? 'active' : 'invited'),
            createdAt: u.created_at
        }));
    }

    async updateUserRole(userId, newRole, actingAdminId) {
        if (userId === actingAdminId) throw new Error('CANNOT_MODIFY_SELF');
        const user = await User.findByPk(userId);
        if (!user) throw new Error('USER_NOT_FOUND');

        await user.update({ role: newRole });
        return { id: user.id, name: user.name, email: user.email, role: user.role };
    }

        async setUserActive(userId, isActive, actingAdminId, reason) {
        if (userId === actingAdminId) throw new Error('CANNOT_MODIFY_SELF');
        const user = await User.findByPk(userId);
        if (!user) throw new Error('USER_NOT_FOUND');

        await user.update({ isActive });

        if (!isActive) {
            sendAccountDeactivatedEmail(user.email, user.name, reason).catch(err =>
                console.error('Failed to send deactivation email:', err)
            );
        } else {
            sendAccountReactivatedEmail(user.email, user.name).catch(err =>
                console.error('Failed to send reactivation email:', err)
            );
        }

        return { id: user.id, name: user.name, email: user.email };
    }
    async inviteUser(name, email, invitedByEmail) {
        const existing = await User.findOne({ where: { email } });
        if (existing && existing.passwordHash) {
            throw new Error('USER_ALREADY_ACTIVE');
        }

        let user = existing;
        if (!user) {
            user = await User.create({
                name,
                email,
                role: 'user',
                isVerified: false,
            });
        }

        sendInvitationEmail(email, invitedByEmail).catch(err =>
            console.error('Failed to send invitation email:', err)
        );

        return { id: user.id, name: user.name, email: user.email };
    }

    async inviteUsersFromCsv(rows, invitedByEmail) {
        const results = { invited: [], skipped: [] };

        for (const row of rows) {
            const name = row.name;
            const email = row.email;

            if (!name || !email) {
                results.skipped.push({ row, reason: 'Missing name or email' });
                continue;
            }

            try {
                await this.inviteUser(name, email, invitedByEmail);
                results.invited.push(email);
            } catch (error) {
                results.skipped.push({ row, reason: error.message === 'USER_ALREADY_ACTIVE' ? 'Already registered' : 'Failed to invite' });
            }
        }

        return results;
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

    async getTurnaroundAudit() {
        // Fetch all completed workflow steps with their document
        const { WorkflowStep, Document } = require('../models');
        const steps = await WorkflowStep.findAll({
            where: { status: 'completed' },
            include: [{
                model: Document,
                attributes: ['id', 'created_at']
            }],
            order: [['document_id', 'ASC'], ['stepOrder', 'ASC']]
        });

        // We need to calculate turnaround for each step.
        // If stepOrder == 1, startedAt = Document.created_at
        // If stepOrder > 1, startedAt = signedAt of the previous step in the same document
        
        // Let's build a map of document steps to easily find the previous step
        const docSteps = {};
        for (const step of steps) {
            const docId = step.document_id;
            if (!docSteps[docId]) docSteps[docId] = [];
            docSteps[docId].push(step);
        }

        const signerStats = {}; // { [email]: { name, totalHours, count } }
        let totalGlobalHours = 0;
        let globalCount = 0;

        for (const step of steps) {
            if (!step.signedAt) continue; // safety check
            
            let startedAt = step.Document.created_at;
            if (step.stepOrder > 1) {
                // Find previous step
                const previousStep = docSteps[step.document_id].find(s => s.stepOrder === step.stepOrder - 1);
                if (previousStep && previousStep.signedAt) {
                    startedAt = previousStep.signedAt;
                }
            }

            const turnaroundMs = new Date(step.signedAt) - new Date(startedAt);
            if (turnaroundMs < 0) continue; // anomalous data

            const turnaroundHours = turnaroundMs / (1000 * 60 * 60);

            const email = step.signerEmail;
            if (!signerStats[email]) {
                signerStats[email] = {
                    name: step.signerName,
                    email: email,
                    totalHours: 0,
                    count: 0
                };
            }

            signerStats[email].totalHours += turnaroundHours;
            signerStats[email].count += 1;

            totalGlobalHours += turnaroundHours;
            globalCount += 1;
        }

        const signers = Object.values(signerStats).map(s => {
            const avgHours = s.totalHours / s.count;
            let rating = 'Fast';
            if (avgHours > 24) rating = 'Slow';
            else if (avgHours > 12) rating = 'Average';

            return {
                name: s.name,
                email: s.email,
                documentsSigned: s.count,
                avgTurnaroundHours: avgHours,
                rating
            };
        });

        // Sort fastest first
        signers.sort((a, b) => a.avgTurnaroundHours - b.avgTurnaroundHours);

        const globalAvgTurnaroundHours = globalCount > 0 ? totalGlobalHours / globalCount : 0;

        return {
            globalAvgTurnaroundHours,
            totalSigners: signers.length,
            signers
        };
    }
}

module.exports = new AdminService();