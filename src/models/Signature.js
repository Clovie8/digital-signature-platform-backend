const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); 

const Signature = sequelize.define('Signature', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    signer_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'signers', // Must match the tableName of the Signer model
            key: 'id'
        }
    },
    signature_url: {
        type: DataTypes.STRING,
        allowNull: false, 
    }
}, {
    tableName: 'signatures',
    timestamps: true, 
    underscored: true
});

module.exports = Signature;