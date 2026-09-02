const adminService = require('../services/adminService');
const asyncHandler = require('../utils/asyncHandler');

const listUsers = asyncHandler(async (req, res) => {
    const users = await adminService.listUsers();
    res.status(200).json({ users });
});

const listAuditLogs = asyncHandler(async (req, res) => {
    const { page, limit, action, actorEmail, documentId, startDate, endDate } = req.query;
    const result = await adminService.listAuditLogs({ page, limit, action, actorEmail, documentId, startDate, endDate });
    res.status(200).json(result);
});

module.exports = { listUsers, listAuditLogs };