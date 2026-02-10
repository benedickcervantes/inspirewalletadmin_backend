const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
    const status = err.status || 500;
    const requestId = req.id;

    logger.error({
        err,
        requestId,
        path: req.originalUrl,
        method: req.method
    }, 'Unhandled error');

    res.status(status).json({
        success: false,
        error: status === 500 ? 'Internal server error' : err.message,
        requestId
    });
}

module.exports = errorHandler;
