const sequelize = require('../config/db');

// Import all models
const User = require('./User');
const Document = require('./Document');
const WorkflowStep = require('./WorkflowStep');
const AuditLog = require('./AuditLog');

// Define Relationships (Associations)

// User <-> Document
User.hasMany(Document, { foreignKey: 'initiator_id', onDelete: 'CASCADE' });
Document.belongsTo(User, { foreignKey: 'initiator_id' });

// Document <-> Document (revisions)
Document.belongsTo(Document, { as: 'parentDocument', foreignKey: 'parent_document_id' });
Document.hasMany(Document, { as: 'revisions', foreignKey: 'parent_document_id' });

// Document <-> WorkflowStep
Document.hasMany(WorkflowStep, { foreignKey: 'document_id', onDelete: 'CASCADE' });
WorkflowStep.belongsTo(Document, { foreignKey: 'document_id' });

// Document <-> AuditLog
Document.hasMany(AuditLog, { foreignKey: 'document_id', onDelete: 'CASCADE' });
AuditLog.belongsTo(Document, { foreignKey: 'document_id' });

// Export everything as a centralized module
module.exports = {
    sequelize,
    User,
    Document,
    WorkflowStep,
    AuditLog
};