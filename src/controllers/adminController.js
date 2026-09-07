const adminService = require('../services/adminService');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');

const listUsers = asyncHandler(async (req, res) => {
    const users = await adminService.listUsers();
    res.status(200).json({ users });
});

const listAuditLogs = asyncHandler(async (req, res) => {
    const { page, limit, action, actorEmail, documentId, startDate, endDate } = req.query;
    const result = await adminService.listAuditLogs({ page, limit, action, actorEmail, documentId, startDate, endDate });
    res.status(200).json(result);
});

const inviteUser = asyncHandler(async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) throw new ValidationError('Name and email are required.');

    try {
        const user = await adminService.inviteUser(name, email, req.user.email);
        res.status(201).json({ message: 'Invitation sent.', user });
    } catch (error) {
        if (error.message === 'USER_ALREADY_ACTIVE') throw new ValidationError('This user already has an active account.');
        throw error;
    }
});

const inviteUsersCsv = asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('No CSV file uploaded.');

    const csvText = req.file.buffer.toString('utf-8');
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    const [headerLine, ...dataLines] = lines;
    const headers = headerLine.split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.indexOf('name');
    const emailIdx = headers.indexOf('email');

    if (nameIdx === -1 || emailIdx === -1) {
        throw new ValidationError('CSV must have "name" and "email" columns.');
    }

    const rows = dataLines.map(line => {
        const cols = line.split(',');
        return { name: cols[nameIdx]?.trim(), email: cols[emailIdx]?.trim() };
    });

    const results = await adminService.inviteUsersFromCsv(rows, req.user.email);
    res.status(200).json({ message: `${results.invited.length} invited, ${results.skipped.length} skipped.`, ...results });
});

const updateUserRole = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) throw new ValidationError('Role must be "user" or "admin".');

    try {
        const user = await adminService.updateUserRole(id, role, req.user.userId);
        res.status(200).json({ message: 'Role updated.', user });
    } catch (error) {
        if (error.message === 'CANNOT_MODIFY_SELF') throw new ValidationError('You cannot change your own role.');
        if (error.message === 'USER_NOT_FOUND') throw new NotFoundError('User not found.');
        throw error;
    }
});

const deactivateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        await adminService.setUserActive(id, false, req.user.userId);
        res.status(200).json({ message: 'User deactivated.' });
    } catch (error) {
        if (error.message === 'CANNOT_MODIFY_SELF') throw new ValidationError('You cannot deactivate your own account.');
        if (error.message === 'USER_NOT_FOUND') throw new NotFoundError('User not found.');
        throw error;
    }
});

const reactivateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        await adminService.setUserActive(id, true, req.user.userId);
        res.status(200).json({ message: 'User reactivated.' });
    } catch (error) {
        if (error.message === 'USER_NOT_FOUND') throw new NotFoundError('User not found.');
        throw error;
    }
});

module.exports = { listUsers, listAuditLogs, inviteUser, inviteUsersCsv, updateUserRole, deactivateUser, reactivateUser, };