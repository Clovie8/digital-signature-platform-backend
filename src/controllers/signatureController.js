const signatureService = require('../services/signatureService');
const asyncHandler = require('../utils/asyncHandler');
const { AppError, NotFoundError, ValidationError, UnauthorizedError } = require('../utils/errors');

const submitSignature = asyncHandler(async (req, res) => {
    try {
        const { token } = req.body;
        const signerIp = req.ip || req.connection.remoteAddress;

        if (!token) throw new ValidationError('Access token is required.');

        const result = await signatureService.submit(token, signerIp);
        res.status(200).json(result);
    } catch (error) {
        if (error.message === 'INVALID_TOKEN') throw new UnauthorizedError('Invalid token, or document already signed.');
        throw error;
    }
});

module.exports = { submitSignature };
