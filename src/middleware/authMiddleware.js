const jwt = require('jsonwebtoken');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
require('dotenv').config();

const authenticateToken = (req, res, next) => {
    // Check for token in secure HttpOnly cookie OR Authorization header (for fallback/Postman)
    const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]); 

    // If there is no token, hand off to the Global Error Catcher
    if (!token) {
        return next(new UnauthorizedError('Access denied. No session token provided.'));
    }

    // Verify the token is valid and hasn't been tampered with
    jwt.verify(token, process.env.JWT_SECRET, (err, decodedUser) => {
        if (err) {
            console.error('JWT VERIFY ERROR:', err); return next(new Error('Invalid or expired session token.'));
        }

        // Attach the decoded payload to the request object for the controllers to use
        req.user = decodedUser; 
        next(); 
    });
};

module.exports = authenticateToken;