require('dotenv').config({ path: 'C:/Users/pc/OneDrive/Documents/Isco Internship/Digital Signature/backend/.env' });
const { Document, User } = require('C:/Users/pc/OneDrive/Documents/Isco Internship/Digital Signature/backend/src/models');

async function testQuery() {
    try {
        const document = await Document.findOne({
            include: [User]
        });

        if (!document) {
            console.log('No documents found in DB to test.');
            process.exit(0);
        }

        console.log('Document ID:', document.id);
        console.log('Document Initiator ID:', document.initiator_id || document.getDataValue('initiator_id'));
        console.log('Attached User Object:', document.User ? 'EXISTS' : 'UNDEFINED OR NULL');
        if (document.User) {
            console.log('User Email:', document.User.email);
        }
        process.exit(0);
    } catch (err) {
        console.error('Sequelize Error:', err);
        process.exit(1);
    }
}

testQuery();
