const ApiKey = require('../models/ApiKey');

/**
 * Middleware to validate API key
 */
async function apiKeyAuth(req, res, next) {
    const apiKey = req.header('X-API-Key');

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: 'API key is required'
        });
    }

    try {
        const isValid = await ApiKey.validate(apiKey);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key'
            });
        }
        next();
    } catch (error) {
        console.error('Error validating API key:', error);
        res.status(500).json({
            success: false,
            error: 'Error validating API key'
        });
    }
}

module.exports = apiKeyAuth;


