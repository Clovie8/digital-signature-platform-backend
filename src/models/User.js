const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    role: {
        type: DataTypes.ENUM('user', 'admin'),
        defaultValue: 'user',
    },
    isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    verificationToken: DataTypes.STRING,
    resetPasswordToken: DataTypes.STRING,
    resetPasswordExpiresAt: DataTypes.DATE,
}, {
    tableName: 'users',
    underscored: true, 
    timestamps: true, 
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = User;