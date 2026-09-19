const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TemplateSigner = sequelize.define('TemplateSigner', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    
}, {
    tableName: 'template_signers',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
        {
            unique: true,
            fields: ['template_id', 'user_id'],
        },
    ],
});

module.exports = TemplateSigner;