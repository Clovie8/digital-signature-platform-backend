const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); 

const Signature = sequelize.define('Signature', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    signer_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    signer_email: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    signature_url: {
        type: DataTypes.STRING,
        allowNull: false, 
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: true, 
    }
}, {
    tableName: 'signatures',
    timestamps: true, 
    underscored: true
});

module.exports = Signature;