const adminAuthService = require('../services/adminAuthService');

/**
 * AdminAuthController - Handles HTTP requests for admin authentication
 * Uses Firestore adminUsers collection
 */
class AdminAuthController {
    /**
     * Login admin with Firebase ID token
     * Client should authenticate with Firebase first, then send the ID token
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

            const result = await adminAuthService.loginWithFirebaseToken(firebaseToken);

            res.json({
                success: true,
                message: 'Admin login successful',
                data: {
                    user: result.user,
                    token: result.token
                }
            });
        } catch (error) {
            console.error('Admin Firebase login error:', error);

            if (error.message.includes('not an admin')) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied. User is not an admin.'
                });
            }

            if (error.message.includes('Insufficient admin privileges')) {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient admin privileges'
                });
            }

            if (error.message.includes('Firebase')) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired Firebase token'
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Admin login failed'
            });
        }
    };

    /**
     * Login admin with email/password
     * This checks admin exists in Firebase RTDB then issues JWT
     * Note: For full password verification, use firebaseLogin with client-side Firebase auth
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    login = async (req, res) => {
        try {
            const { email, emailAddress, password } = req.body;
            const userEmail = email || emailAddress;

            if (!userEmail) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is required'
                });
            }

            if (!password) {
                return res.status(400).json({
                    success: false,
                    error: 'Password is required'
                });
            }

            const result = await adminAuthService.loginWithCredentials(userEmail, password);

            res.json({
                success: true,
                message: 'Admin login successful',
                data: {
                    user: result.user,
                    token: result.token
                }
            });
        } catch (error) {
            console.error('Admin login error:', error);

            if (error.message.includes('Invalid email or password')) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }

            if (error.message.includes('Insufficient admin privileges')) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied. Insufficient privileges.'
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Admin login failed'
            });
        }
    };

    /**
     * Register a new admin user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    register = async (req, res) => {
        try {
            const { name, firstName, lastName, email, emailAddress, password, confirmPassword, role } = req.body;

            // Support various name formats
            const adminName = name || (firstName && lastName ? `${firstName} ${lastName}` : firstName || '');
            const adminEmail = email || emailAddress;

            if (!adminName) {
                return res.status(400).json({
                    success: false,
                    error: 'Name is required'
                });
            }

            if (!adminEmail) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is required'
                });
            }

            if (!password) {
                return res.status(400).json({
                    success: false,
                    error: 'Password is required'
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 6 characters'
                });
            }

            if (confirmPassword && password !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Passwords do not match'
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(adminEmail)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid email format'
                });
            }

            const result = await adminAuthService.register({
                name: adminName,
                email: adminEmail,
                password,
                role: role || 'admin'
            });

            res.status(201).json({
                success: true,
                message: 'Admin registered successfully',
                data: {
                    user: result.user,
                    token: result.token
                }
            });
        } catch (error) {
            console.error('Admin registration error:', error);

            if (error.message.includes('already exists') || error.message.includes('already registered')) {
                return res.status(409).json({
                    success: false,
                    error: 'Admin with this email already exists'
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Admin registration failed'
            });
        }
    };

    /**
     * Get admin profile (protected route)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    getProfile = async (req, res) => {
        try {
            const adminId = req.adminId || req.user?.adminId;

            if (!adminId) {
                return res.status(401).json({
                    success: false,
                    error: 'Admin ID not found in token'
                });
            }

            const profile = await adminAuthService.getProfile(adminId);

            res.json({
                success: true,
                data: profile
            });
        } catch (error) {
            console.error('Get admin profile error:', error);

            if (error.message === 'Admin not found') {
                return res.status(404).json({
                    success: false,
                    error: 'Admin not found'
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get admin profile'
            });
        }
    };
}

const adminAuthControllerInstance = new AdminAuthController();
module.exports = adminAuthControllerInstance;
module.exports.AdminAuthController = AdminAuthController;
