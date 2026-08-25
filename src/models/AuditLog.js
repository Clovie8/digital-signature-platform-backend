const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const AuditLog = sequelize.define('AuditLog', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    actorEmail: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    ipAddress: DataTypes.STRING(45),
    resultingHash: DataTypes.TEXT,
}, {
    tableName: 'audit_logs',
    underscored: true,
    timestamps: true,
    updatedAt: false, // Audit logs don't get updated, only created
    createdAt: 'created_at'
});

module.exports = AuditLog;