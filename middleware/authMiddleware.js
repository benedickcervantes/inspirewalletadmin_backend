const authService = require('../services/authService');

/**
 * Middleware to authenticate JWT token
 */
function authenticateToken(req, res, next) {
    try {
        // Get token from Authorization header or query parameter
        const authHeader = req.headers['authorization'];
        const [scheme, token] = authHeader ? authHeader.split(' ') : [];

        if (!token || !scheme || scheme.toLowerCase() !== 'bearer') {
            return res.status(401).json({
                success: false,
                error: 'Authentication token required'
            });
        }

        // Verify token
        const decoded = authService.verifyToken(token);
        
        // Attach user info to request
        req.user = decoded;
        req.userId = decoded.userId;
        
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: error.message || 'Invalid or expired token'
        });
    }
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const [scheme, token] = authHeader ? authHeader.split(' ') : [];

        if (token && scheme && scheme.toLowerCase() === 'bearer') {
            const decoded = authService.verifyToken(token);
            req.user = decoded;
            req.userId = decoded.userId;
        }
        
        next();
    } catch (error) {
        // Continue without authentication if token is invalid
        next();
    }
}

module.exports = {
    authenticateToken,
    optionalAuth
};


