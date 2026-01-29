/**
 * Middleware to validate agent request body structure
 */
function validateAgentRequest(req, res, next) {
    const { referrerCode, agentNumber } = req.body;

    if (!referrerCode || !agentNumber) {
        return res.status(400).json({
            success: false,
            error: 'Referrer code and agent number are required'
        });
    }

    // Validate referrer code format (basic check)
    if (typeof referrerCode !== 'string' || referrerCode.trim().length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Invalid referrer code format'
        });
    }

    // Validate agent number format (must be 5 alphanumeric characters)
    if (typeof agentNumber !== 'string' || !/^[A-Z0-9]{5}$/.test(agentNumber)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid agent number. Must be exactly 5 alphanumeric characters.'
        });
    }

    next();
}

module.exports = validateAgentRequest;


