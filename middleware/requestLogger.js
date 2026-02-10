const { randomUUID } = require('crypto');
const pinoHttp = require('pino-http');
const logger = require('../utils/logger');

const requestLogger = pinoHttp({
    logger,
    genReqId: (req, res) => {
        if (req.id) return req.id;
        const headerValue = req.headers['x-request-id'];
        const incomingId = typeof headerValue === 'string' ? headerValue.trim() : '';
        const id = incomingId || randomUUID();
        req.id = id;
        res.setHeader('X-Request-Id', id);
        return id;
    },
    customProps: (req) => ({
        requestId: req.id,
        userId: req.userId
    }),
    serializers: {
        req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            remoteAddress: req.ip
        }),
        res: (res) => ({
            statusCode: res.statusCode
        })
    }
});

module.exports = requestLogger;
