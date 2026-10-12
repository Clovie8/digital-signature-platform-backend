const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Folder = sequelize.define('Folder', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    owner_id: { type: DataTypes.UUID, allowNull: false },
    parent_folder_id: { type: DataTypes.UUID, allowNull: true },
    type: { 
        type: DataTypes.ENUM('document', 'template'), 
        allowNull: false, 
        defaultValue: 'document' 
    },
    is_public: { type: DataTypes.BOOLEAN, defaultValue: false },
    trashed_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    trashed_with_folder_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null }
}, {
    tableName: 'folders',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = Folder;
