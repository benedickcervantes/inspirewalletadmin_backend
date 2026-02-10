const { randomUUID } = require('crypto');

function requestId(req, res, next) {
    const headerValue = req.headers['x-request-id'];
    const incomingId = typeof headerValue === 'string' ? headerValue.trim() : '';
    const id = incomingId || randomUUID();

    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
}

module.exports = requestId;
