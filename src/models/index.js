const sequelize = require('../config/db');

// Import all models
const User = require('./User');
const Document = require('./Document');
const WorkflowStep = require('./WorkflowStep');
const AuditLog = require('./AuditLog');
const Signer = require('./Signer');
const Signature = require('./Signature');
const Folder = require('./Folder');
const FolderAccess = require('./FolderAccess');

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

// User <-> Signature
User.hasMany(Signature, { foreignKey: 'user_id' });
Signature.belongsTo(User, { foreignKey: 'user_id' });


// Folder <-> Folder (Self-referencing for hierarchy)
Folder.belongsTo(Folder, { as: 'parentFolder', foreignKey: 'parent_folder_id' });
Folder.hasMany(Folder, { as: 'subFolders', foreignKey: 'parent_folder_id', onDelete: 'CASCADE' });

// User <-> Folder (Owner)
User.hasMany(Folder, { foreignKey: 'owner_id', as: 'ownedFolders' });
Folder.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });

// Folder <-> Document
Folder.hasMany(Document, { foreignKey: 'folder_id', as: 'documents', onDelete: 'CASCADE' });
Document.belongsTo(Folder, { foreignKey: 'folder_id', as: 'folder' });

// ACL: Folder <-> FolderAccess <-> User
Folder.hasMany(FolderAccess, { foreignKey: 'folder_id', as: 'accesses', onDelete: 'CASCADE' });
FolderAccess.belongsTo(Folder, { foreignKey: 'folder_id' });

User.hasMany(FolderAccess, { foreignKey: 'user_id', as: 'folderAccesses', onDelete: 'CASCADE' });
FolderAccess.belongsTo(User, { foreignKey: 'user_id' });

Signer.hasMany(Signature, { foreignKey: 'signer_id', as: 'signatures', onDelete: 'CASCADE' });
Signature.belongsTo(Signer, { foreignKey: 'signer_id', as: 'signer' });

// Export everything as a centralized module
module.exports = {
    sequelize,
    User,
    Document,
    WorkflowStep,
    AuditLog, 
    Signature,
    Signer,
    Folder,
    FolderAccess
};