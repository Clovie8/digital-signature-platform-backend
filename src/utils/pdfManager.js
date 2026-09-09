const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
require('dotenv').config();

// Initialize the S3 Client for Cloudflare R2
const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const stampDocument = async (pdfBuffer, fields, completedValues) => {
    try {
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const cursiveFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
        const pages = pdfDoc.getPages();

        for (const field of fields) {
            const pageIndex = field.page ? field.page - 1 : 0; 
            if (pageIndex < 0 || pageIndex >= pages.length) continue;
            
            const page = pages[pageIndex];
            const { width, height } = page.getSize();
            const value = completedValues[field.id];
            if (!value) continue;

            const targetX = (field.xPct / 100) * width;
            const targetY = height - ((field.yPct / 100) * height);

            
            const pdfFieldWidth = field.width ? (field.width / 750) * width : undefined;
            const pdfFieldHeight = field.height ? (field.height / 750) * width : undefined; 


            // Check if the frontend sent a drawn PNG image
            if (value.startsWith('data:image/png;base64,')) {
                // Embed the PNG into the PDF
                const pngImage = await pdfDoc.embedPng(value);
                
                // If we have custom resized dimensions, use them. Otherwise default scale.
                const drawWidth = pdfFieldWidth || (pngImage.width * 0.3);
                const drawHeight = pdfFieldHeight || (pngImage.height * 0.3);

                page.drawImage(pngImage, {
                    x: targetX,
                    y: targetY - drawHeight,
                    width: drawWidth,
                    height: drawHeight,
                });
            } else {
                // It is typed text (either plain or prefixed with 'TYPED::')
                const textToStamp = value.replace('TYPED::', '');
                const isSignature = field.type === 'Signature' || field.type === 'Initial';

                // Dynamically scale font size if the box was resized vertically
                const baseFontSize = isSignature ? 24 : 12;
                const dynamicFontSize = pdfFieldHeight ? Math.max(12, Math.min(baseFontSize * 2, pdfFieldHeight * 0.6)) : baseFontSize;

                page.drawText(textToStamp, {
                    x: targetX,
                    y: targetY - (pdfFieldHeight ? pdfFieldHeight : 12), 
                    size: dynamicFontSize,
                    font: isSignature ? cursiveFont : font,
                    color: rgb(0, 0.1, 0.4), 
                });
            }
        }

        return await pdfDoc.save();
    } catch (error) {
        console.error('PDF Stamping Error:', error);
        throw new Error('Failed to stamp PDF file');
    }
};


const appendAuditTrail = async (pdfBuffer, auditLogs, documentName) => {
    // Load the fully signed PDF
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    // Embed standard and bold fonts for formatting
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Create a brand new, blank page at the end of the document
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();

    // Draw the Header
    page.drawText('DSign - Certificate of Completion', { 
        x: 50, y: height - 60, size: 20, font: boldFont, color: rgb(0, 0.1, 0.4) 
    });
    page.drawText(`Document: ${documentName}`, { 
        x: 50, y: height - 85, size: 12, font 
    });
    
    // Draw a divider line
    page.drawLine({
        start: { x: 50, y: height - 100 },
        end: { x: width - 50, y: height - 100 },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8)
    });

    // Loop through the logs and print the ledger
    let cursorY = height - 130;

    for (const log of auditLogs) {
        if (cursorY < 50) {
            const newPage = pdfDoc.addPage();
            cursorY = height - 50; 
        }

        page.drawText(`${log.action.replace(/_/g, ' ')}`, { x: 50, y: cursorY, size: 10, font: boldFont });
        cursorY -= 15;
        
        // Fallback to camelCase for Sequelize compatibility
        const actorEmail = log.actorEmail || log.actor_email;
        const createdAt = log.createdAt || log.created_at;
        const ipAddress = log.ipAddress || log.ip_address || 'Unknown';
        const resultingHash = log.resultingHash || log.resulting_hash;

        page.drawText(`Actor: ${actorEmail}`, { x: 50, y: cursorY, size: 10, font });
        cursorY -= 15;
        
        page.drawText(`Date: ${new Date(createdAt).toLocaleString('en-US')} | IP: ${ipAddress}`, { x: 50, y: cursorY, size: 10, font });
        cursorY -= 15;
        
        if (resultingHash) {
            page.drawText(`SHA-256 Hash: ${resultingHash}`, { x: 50, y: cursorY, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
            cursorY -= 15;
        }
        
        cursorY -= 20; 
    }
    return await pdfDoc.save();
}

module.exports = { stampDocument, appendAuditTrail };