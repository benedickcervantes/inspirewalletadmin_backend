const pino = require('pino');

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: {
        service: 'iwallet-backend'
    },
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.newPassword',
            'req.body.currentPassword',
            'req.body.confirmPassword',
            'req.body.passcode',
            'req.body.firebaseToken',
            'req.body.apiKey',
            'req.body.refreshToken'
        ],
        remove: true
    }
});

module.exports = logger;
