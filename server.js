require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const os = require('os');

// Import Firebase config
const { initializeFirebase } = require('./config/firebase');

// Import routes
const routes = require('./routes');

// Middleware
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiters');
const logger = require('./utils/logger');

// Initialize Express app
const app = express();

app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

// In development, allow common local development origins
if (process.env.NODE_ENV !== 'production') {
    const devOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://192.168.1.56:3000' // Common local network IP
    ];
    // Add any additional dev origins from env if specified
    const additionalDevOrigins = (process.env.CORS_DEV_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    allowedOrigins.push(...devOrigins, ...additionalDevOrigins);
}

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    logger.warn('CORS_ORIGINS is not set; all origins will be allowed.');
}

app.use(requestId);
app.use(requestLogger);
app.use(helmet({
    contentSecurityPolicy: false
}));
app.use(cors({
    origin: allowedOrigins.length > 0 ? (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
            return callback(null, true);
        }
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // In development, allow any localhost/loopback (any port) and common LAN origins.
        // This prevents CORS breakage when the frontend dev server falls back to an available port (e.g. 3004).
        if (process.env.NODE_ENV !== 'production') {
            const localOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
            const lanOriginRegex = /^https?:\/\/(172\.23\.176\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;

            if (localOriginRegex.test(origin) || lanOriginRegex.test(origin)) {
                return callback(null, true);
            }

            logger.warn(`CORS: Origin ${origin} not allowed. Allowed origins: ${allowedOrigins.join(', ')}`);
        }

        return callback(new Error('Not allowed by CORS'));
    } : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id', 'X-API-Key'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));
app.use(cookieParser());
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.REQUEST_BODY_LIMIT || '1mb' }));
app.use(hpp());
app.use(apiLimiter);

// Routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Inspire Wallet Backend API',
        version: '1.0.0'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Error handler
app.use(errorHandler);

/**
 * Get local network IP address
 */
const getLocalIP = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
};

/**
 * Start server and initialize Firebase
 */
async function startServer() {
    try {
        // Initialize Firebase Admin SDK (provides Firestore)
        console.log('\n🔥 Firebase: Initializing Admin SDK...');
        initializeFirebase();
        console.log('');

        // Start server
        const PORT = process.env.PORT || 4000;
        const HOST = '0.0.0.0'; // Listen on all network interfaces
        const localIP = getLocalIP();

        app.listen(PORT, HOST, () => {
            console.log('\n🚀 Server is running!\n');
            console.log(`📍 Local:   http://localhost:${PORT}`);
            console.log(`🌐 Network: http://${localIP}:${PORT}\n`);
            console.log(`📡 Listening on ${HOST}:${PORT}\n`);
        });
    } catch (error) {
        console.error('\n❌ Failed to start server:', error.message);
        console.error('❌ Server startup aborted\n');
        process.exit(1);
    }
}

// Start the server
startServer();

module.exports = app;
