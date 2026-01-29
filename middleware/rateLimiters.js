const rateLimit = require('express-rate-limit');

const getNumber = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const apiWindowMs = getNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const apiMax = getNumber(process.env.RATE_LIMIT_MAX, 100);
const authWindowMs = getNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const authMax = getNumber(process.env.AUTH_RATE_LIMIT_MAX, 10);

const apiLimiter = rateLimit({
    windowMs: apiWindowMs,
    limit: apiMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests, please try again later.'
    }
});

const authLimiter = rateLimit({
    windowMs: authWindowMs,
    limit: authMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later.'
    }
});

module.exports = {
    apiLimiter,
    authLimiter
};
