const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');
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
        
        // Register fontkit to allow embedding custom TTF fonts
        pdfDoc.registerFontkit(fontkit);

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        // Load custom handwriting font for signatures and initials
        const fontPath = path.join(__dirname, '..', 'assets', 'fonts', 'Caveat-Regular.ttf');
        const fontBytes = fs.readFileSync(fontPath);
        const cursiveFont = await pdfDoc.embedFont(fontBytes);
        
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


            // Check if the frontend sent an image
            if (value.startsWith('data:image/')) {
                let image;
                if (value.includes('image/png')) {
                    image = await pdfDoc.embedPng(value);
                } else if (value.includes('image/jpeg') || value.includes('image/jpg')) {
                    image = await pdfDoc.embedJpg(value);
                } else {
                    continue; // unsupported
                }
                
                const imgAspect = image.width / image.height;
                const boxAspect = pdfFieldWidth / pdfFieldHeight;

                let drawWidth, drawHeight;
                if (imgAspect > boxAspect) {
                    drawWidth = pdfFieldWidth;
                    drawHeight = pdfFieldWidth / imgAspect;
                } else {
                    drawHeight = pdfFieldHeight;
                    drawWidth = pdfFieldHeight * imgAspect;
                }

                // Center the image inside the bounding box
                const offsetX = (pdfFieldWidth - drawWidth) / 2;
                const offsetY = (pdfFieldHeight - drawHeight) / 2;

                page.drawImage(image, {
                    x: targetX + offsetX,
                    y: (targetY - pdfFieldHeight) + offsetY,
                    width: drawWidth,
                    height: drawHeight,
                });
            } else {
                // It is typed text (either plain or prefixed with 'TYPED::')
                let textToStamp = value;
                let customFontSize = null;
                if (value.startsWith('TYPED::')) {
                    const parts = value.split('::');
                    if (parts.length >= 3 && !isNaN(parts[1])) {
                        customFontSize = parseInt(parts[1]);
                        textToStamp = parts.slice(2).join('::');
                    } else {
                        textToStamp = value.replace('TYPED::', '');
                    }
                }

                const isSignature = field.type === 'Signature' || field.type === 'Initial';
                const baseFontSize = isSignature ? 24 : 14;
                const dynamicFontSize = customFontSize || baseFontSize;
                
                // Scale the CSS pixel font size (based on 750px canvas) to the actual PDF document width in points
                const scaledFontSize = (dynamicFontSize / 750) * width;
                
                const activeFont = isSignature ? cursiveFont : font;
                const textWidth = activeFont.widthOfTextAtSize(textToStamp, scaledFontSize);
                
                let textX = targetX;
                if (isSignature) {
                    // Center align signatures/initials
                    textX = targetX + (pdfFieldWidth - textWidth) / 2;
                } else {
                    // Left align with small padding (4px in 750px scale)
                    const paddingX = (4 / 750) * width;
                    textX = targetX + paddingX;
                }
                
                const isMultiline = field.type === 'Text Box' || field.type === 'Name';
                
                // Vertically center using the baseline for single line
                const centerY = targetY - (pdfFieldHeight / 2) - (scaledFontSize / 3);

                const drawOptions = {
                    x: textX,
                    size: scaledFontSize,
                    font: activeFont,
                    color: rgb(0, 0, 0), 
                };

                if (isMultiline) {
                    const paddingX = (4 / 750) * width;
                    drawOptions.maxWidth = pdfFieldWidth - (paddingX * 2);
                    drawOptions.lineHeight = scaledFontSize * 1.2;
                    
                    // If the box is multiline (taller than 2 lines), anchor to top-left. Else center vertically.
                    if (pdfFieldHeight > (scaledFontSize * 2)) {
                        drawOptions.y = targetY - paddingX - scaledFontSize; 
                    } else {
                        drawOptions.y = centerY;
                    }
                } else {
                    drawOptions.y = centerY;
                }

                page.drawText(textToStamp, drawOptions);
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
        const resultingHash = log.resultingHash || log.resulting_hash;

        page.drawText(`Actor: ${actorEmail}`, { x: 50, y: cursorY, size: 10, font });
        cursorY -= 15;
        
        page.drawText(`Date: ${new Date(createdAt).toLocaleString('en-US')}`, { x: 50, y: cursorY, size: 10, font });
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