const authService = require('../services/authService');

/**
 * AuthController - Handles HTTP requests for authentication
 * Uses arrow functions for automatic 'this' binding (ES6 best practice)
 * 
 * @class AuthController
 */
class AuthController {
    /**
     * Get request metadata for token creation
     * @param {Object} req - Express request object
     * @returns {Object} Metadata object
     */
    getMetadata = (req) => {
        return {
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        };
    };

    /**
     * Set refresh token cookie
     * @param {Object} res - Express response object
     * @param {string} refreshToken - Refresh token
     * @param {Date} expiresAt - Expiration date
     */
    setRefreshCookie = (res, refreshToken, expiresAt) => {
        if (!refreshToken) return;
        const isProd = process.env.NODE_ENV === 'production';
        res.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? 'strict' : 'lax',
            path: '/api/auth',
            expires: expiresAt
        });
    };

    /**
     * Clear refresh token cookie
     * @param {Object} res - Express response object
     */
    clearRefreshCookie = (res) => {
        const isProd = process.env.NODE_ENV === 'production';
        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? 'strict' : 'lax',
            path: '/api/auth'
        });
    };

    /**
     * Register a new user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    register = async (req, res) => {
        try {
            const {
                firstName,
                lastName,
                emailAddress,
                password,
                confirmPassword,
                agentNumber,
                agentCode,
                refferedAgent,
                agent,
                userId, // Firebase UID if syncing
                pendingReferral
            } = req.body;

            // Validate required fields
            if (!firstName || !lastName || !emailAddress || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: firstName, lastName, emailAddress, password'
                });
            }

            // Validate password confirmation if provided
            if (confirmPassword && password !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Passwords do not match'
                });
            }

            const minPasswordLength = Number.parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10);
            // Validate password strength
            if (password.length < minPasswordLength) {
                return res.status(400).json({
                    success: false,
                    error: `Password must be at least ${minPasswordLength} characters long`
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailAddress)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid email format'
                });
            }

            // Register user
            const result = await authService.register({
                firstName,
                lastName,
                emailAddress,
                password,
                agentNumber,
                agentCode,
                refferedAgent,
                agent: agent || false,
                userId,
                pendingReferral
            }, this.getMetadata(req));

            this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
            const includeRefreshToken = process.env.REFRESH_TOKEN_IN_BODY === 'true';

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: {
                    user: result.user,
                    token: result.token,
                    ...(includeRefreshToken ? { refreshToken: result.refreshToken } : {})
                }
            });
        } catch (error) {
            console.error('Controller error registering user:', error);

            // Handle duplicate email error
            if (error.message.includes('already registered') || error.code === 11000) {
                return res.status(409).json({
                    success: false,
                    error: 'Email address already registered'
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Failed to register user'
            });
        }
    };

    /**
     * Login user (supports both Firestore and Firebase migration flow)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    login = async (req, res) => {
        try {
            const { emailAddress, email, password, firebaseToken } = req.body;

            // Support both emailAddress and email fields
            const userEmail = emailAddress || email;

            if (!userEmail) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is required'
                });
            }

            // Login user (checks Firestore first, then Firebase)
            const result = await authService.login(userEmail, password, firebaseToken, this.getMetadata(req));

            // If user needs migration
            if (result.needsMigration) {
                return res.status(200).json({
                    success: false,
                    needsMigration: true,
                    message: 'Please set your password to complete migration',
                    data: {
                        firebaseUserId: result.firebaseUserId,
                        email: result.email
                    }
                });
            }

            // Successful login
            this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
            const includeRefreshToken = process.env.REFRESH_TOKEN_IN_BODY === 'true';

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    user: result.user,
                    token: result.token,
                    migrated: result.migrated || false,
                    ...(includeRefreshToken ? { refreshToken: result.refreshToken } : {})
                }
            });
        } catch (error) {
            console.error('Controller error logging in user:', error);

            // Handle authentication errors
            if (error.message.includes('Invalid email or password')) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }

            if (error.message.includes('needs to set password')) {
                return res.status(200).json({
                    success: false,
                    needsMigration: true,
                    message: error.message,
                    error: error.message
                });
            }

            if (error.message.includes('No matching account')) {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }

            if (error.message.includes('does not match')) {
                return res.status(403).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Failed to login'
            });
        }
    };

    /**
     * Login user with Firebase token (creates/links Firestore user)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    firebaseLogin = async (req, res) => {
        try {
            const { firebaseToken } = req.body;

            if (!firebaseToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Firebase token is required'
                });
            }

            const result = await authService.loginWithFirebaseToken(firebaseToken, this.getMetadata(req));

            this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
            const includeRefreshToken = process.env.REFRESH_TOKEN_IN_BODY === 'true';

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    user: result.user,
                    token: result.token,
                    ...(includeRefreshToken ? { refreshToken: result.refreshToken } : {})
                }
            });
        } catch (error) {
            console.error('Controller error logging in user with Firebase:', error);

            if (error.message.includes('Invalid Firebase token')) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid Firebase token'
                });
            }

            if (error.message.includes('Firebase token is missing user data')) {
                return res.status(400).json({
                    success: false,
                    error: 'Firebase token is missing user data'
                });
            }

            if (error.message.includes('Firebase UID does not match')) {
                return res.status(409).json({
                    success: false,
                    error: 'Firebase UID does not match existing user'
                });
            }

            if (error.message.includes('User data not found in Firebase')) {
                return res.status(404).json({
                    success: false,
                    error: 'User data not found in Firebase'
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Failed to login'
            });
        }
    };

    /**
     * Get user profile (protected route)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    getProfile = async (req, res) => {
        try {
            const userId = req.userId || req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User ID not found in token'
                });
            }

            const user = await authService.getProfile(userId);

            res.json({
                success: true,
                data: user
            });
        } catch (error) {
            console.error('Controller error getting profile:', error);

            if (error.message === 'User not found') {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get profile'
            });
        }
    };

    /**
     * Refresh access token using refresh token
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    refresh = async (req, res) => {
        try {
            const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
            const result = await authService.refreshSession(refreshToken, this.getMetadata(req));

            this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
            const includeRefreshToken = process.env.REFRESH_TOKEN_IN_BODY === 'true';

            res.json({
                success: true,
                data: {
                    token: result.token,
                    ...(includeRefreshToken ? { refreshToken: result.refreshToken } : {})
                }
            });
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: error.message || 'Failed to refresh session'
            });
        }
    };

    /**
     * Logout user and invalidate refresh token
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    logout = async (req, res) => {
        try {
            const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
            await authService.revokeRefreshToken(refreshToken, this.getMetadata(req));
            this.clearRefreshCookie(res);

            res.json({
                success: true,
                message: 'Logged out successfully'
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message || 'Failed to logout'
            });
        }
    };
}

// Export singleton instance for backward compatibility
// Also export the class for testing and dependency injection
const authControllerInstance = new AuthController();
module.exports = authControllerInstance;
module.exports.AuthController = AuthController;
