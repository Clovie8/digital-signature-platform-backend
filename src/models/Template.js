const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Template = sequelize.define('Template', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    fileName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    filePath: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    
    templateConfig: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { fields: [], signers: [] },
    },
    usageCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
}, {
    tableName: 'templates',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = Template;