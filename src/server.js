const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const adminRoutes = require('./routes/adminRoutes');

const { sequelize } = require('./models'); 

const errorMiddleware = require('./middleware/errorMiddleware'); 
const { startDeclineExpiryJob } = require('./utils/declineExpiryJob');

// Route Imports
const documentRoutes = require('./routes/documentRoutes');
const authRoutes = require('./routes/authRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const signatureRoutes = require('./routes/signatureRoutes');

const app = express();

app.use((req, res, next) => {
    console.log(`Incoming: ${req.method} ${req.url}`);
    next();
});

// Middleware
//app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', globalLimiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { error: 'Too many authentication attempts, please try again later.' }
});
app.use('/api/auth/', authLimiter);

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/signatures', signatureRoutes);
app.use('/api/admin', adminRoutes);

// Mount the Global Error Handler 
// This must be the very last app.use() so it can catch everything!
app.use(errorMiddleware);

// Start Server (Only after Database connects successfully)
const PORT = process.env.PORT || 5000;

const { startCronJobs } = require('./services/cronService'); // Import cronService

sequelize.authenticate()
    .then(() => {
        console.log('Database connected via Sequelize!');

        startCronJobs(); // Start the automated background jobs

        app.listen(PORT, () => {
            console.log(`Digital Signature API running on port ${PORT}`);
        });
        startDeclineExpiryJob();
    })
    .catch(err => {
        console.error('Unable to connect to the database:', err);
    });