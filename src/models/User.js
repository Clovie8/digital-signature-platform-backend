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
        allowNull: true,
    },
    role: {
        type: DataTypes.ENUM('user', 'admin'),
        defaultValue: 'user',
    },
    authProvider: {
        type: DataTypes.ENUM('local', 'microsoft', 'google'),
        defaultValue: 'local',
    },
    microsoftId: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
    },
    googleId: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
    },
    isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
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