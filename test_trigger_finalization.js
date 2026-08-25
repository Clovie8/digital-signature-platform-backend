require('dotenv').config({ path: 'C:/Users/pc/OneDrive/Documents/Isco Internship/Digital Signature/backend/.env' });
const documentService = require('C:/Users/pc/OneDrive/Documents/Isco Internship/Digital Signature/backend/src/services/documentService');
const { Document } = require('C:/Users/pc/OneDrive/Documents/Isco Internship/Digital Signature/backend/src/models');

async function run() {
    try {
        // Find a document to finalize
        const document = await Document.findOne({ order: [['created_at', 'DESC']] });
        if (!document) {
            console.log('No document found');
            return;
        }

        console.log(`Triggering finalization for Document ID: ${document.id}`);
        
        // Temporarily overriding console.error to capture the error precisely
        const originalError = console.error;
        console.error = (...args) => {
            originalError('CAUGHT_ERROR:', ...args);
        };

        await documentService.finalizeDocument(document.id);
        
        console.log('Finalization completed script run');
    } catch (err) {
        console.log('Script Caught Error:', err);
    }
    process.exit(0);
}

run();
