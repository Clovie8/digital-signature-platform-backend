const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Document = sequelize.define('Document', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // initiator_id and parent_document_id are handled by relationships in index.js
    fileName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    originalFilePath: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    signedFilePath: DataTypes.TEXT,
    currentHash: DataTypes.TEXT,
    status: {
        type: DataTypes.ENUM('draft', 'pending', 'in_progress', 'pending_review', 'completed', 'declined', 'superseded', 'voided'),
        defaultValue: 'draft',
    },
    version: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
    },
    resumeCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    initiatorReceivesFinalCopy: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    declineWarningSentAt: DataTypes.DATE,
    draftConfig: DataTypes.JSONB,
}, {
    tableName: 'documents',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = Document;