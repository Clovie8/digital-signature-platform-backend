const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
require('dotenv').config();

// Initialize the S3 Client pointed at Cloudflare R2
const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const uploadToR2 = async (fileBuffer, originalName) => {
    try {
        // Generate a unique filename to prevent overwriting
        const fileKey = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${originalName.replace(/\s+/g, '_')}`;
        
        const command = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileKey,
            Body: fileBuffer,
            ContentType: 'application/pdf',
        });

        await s3.send(command);
        
        // Return the exact key (filename) stored in the bucket
        return fileKey; 
    } catch (error) {
        console.error('R2 Upload Error:', error);
        throw new Error('Failed to upload file to Cloudflare R2');
    }
};

const getPresignedPdfUrl = async (fileKey) => {
    try {
        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileKey,
        });
        
        // This URL will securely expire after 1 hour (3600 seconds)
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        return signedUrl;
    } catch (error) {
        console.error('Error generating pre-signed URL:', error);
        throw new Error('Could not generate secure document link');
    }
};

const getFileBufferFromR2 = async (fileKey) => {
    const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileKey,
    });
    const response = await s3.send(command);
    // Convert the readable stream into a Node Buffer
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
};

const uploadBufferToR2 = async (buffer, originalName, mimeType = 'application/pdf') => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const fileKey = `documents/signed-${uniqueSuffix}-${originalName}`;

    const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileKey,
        Body: buffer,
        ContentType: mimeType,
    });

    await s3.send(command);
    return fileKey;
};

module.exports = { uploadToR2, getPresignedPdfUrl, getFileBufferFromR2, uploadBufferToR2 };