const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Signer = sequelize.define('Signer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true, // Guarantees only one vault per email
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: true, 
    },
    pin_hash: {
        type: DataTypes.STRING,
        allowNull: true, 
    },
    reset_otp: {
        type: DataTypes.STRING,
        allowNull: true, 
    },
    reset_otp_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    tableName: 'signers',
    timestamps: true, 
    underscored: true
});

module.exports = Signer;