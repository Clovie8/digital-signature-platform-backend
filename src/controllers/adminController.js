const adminService = require('../services/adminService');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError } = require('../utils/errors');

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

module.exports = { listUsers, listAuditLogs, inviteUser, inviteUsersCsv };