const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
require('dotenv').config();

let graphClient = null;

function getGraphClient() {
    if (graphClient) return graphClient;

    const credential = new ClientSecretCredential(
        process.env.GRAPH_MAIL_TENANT_ID,
        process.env.GRAPH_MAIL_CLIENT_ID,
        process.env.GRAPH_MAIL_CLIENT_SECRET
    );

    graphClient = Client.initWithMiddleware({
        authProvider: {
            getAccessToken: async () => {
                const token = await credential.getToken('https://graph.microsoft.com/.default');
                return token.token;
            },
        },
    });
    return graphClient;
}

function extractDisplayName(fromString) {
    const match = fromString?.match(/^"?([^"<]+)"?\s*</);
    return match ? match[1].trim() : null;
}

async function sendMail({ from, to, subject, html }) {
    const sender = process.env.GRAPH_MAIL_SENDER;
    const displayName = extractDisplayName(from);

    const message = {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
    };
    if (displayName) {
        message.from = { emailAddress: { address: sender, name: displayName } };
    }

    await getGraphClient()
        .api(`/users/${sender}/sendMail`)
        .post({ message, saveToSentItems: false });

    
    return { messageId: `graph-${Date.now()}` };
}

module.exports = { emails: { send: sendMail } };