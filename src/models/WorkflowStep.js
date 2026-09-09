const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const WorkflowStep = sequelize.define('WorkflowStep', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // document_id is handled by relationships in index.js
    signerEmail: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    signerName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    stepOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('pending', 'completed', 'declined', 'voided'),
        defaultValue: 'pending',
    },
    signatureUiData: DataTypes.JSONB,
    accessToken: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
    },
    signedAt: DataTypes.DATE,
    signerIp: DataTypes.STRING(45),
    stepHash: DataTypes.TEXT,
    otpCode: DataTypes.STRING(10),
    otpExpiresAt: DataTypes.DATE,
    declineReason: DataTypes.TEXT,
    declineType: DataTypes.ENUM('resumable', 'requires_revision'),
    lastReminderSentAt: DataTypes.DATE,

    receivesFinalCopy: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    
}, {
    tableName: 'workflow_steps',
    underscored: true,
    timestamps: false, // You don't have created_at/updated_at in this specific SQL table
    indexes: [
        {
            unique: true,
            fields: ['document_id', 'step_order']
        }
    ]
});

module.exports = WorkflowStep;