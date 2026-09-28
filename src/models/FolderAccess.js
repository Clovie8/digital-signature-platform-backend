const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const FolderAccess = sequelize.define('FolderAccess', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    // folder_id and user_id are handled by associations
    role: {
        type: DataTypes.ENUM('viewer', 'editor', 'manager'),
        allowNull: false
    }
}, {
    tableName: 'folder_accesses',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = FolderAccess;
