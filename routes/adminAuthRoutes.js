const express = require('express');
const adminAuthController = require('../controllers/adminAuthController');

const router = express.Router();

/**
 * Admin Authentication Routes
 * Uses Firebase Realtime Database /adminUsers path
 */

/**
 * @route POST /api/admin-auth/login
 * @desc Login admin with email/password
 * @access Public
 */
router.post('/login', adminAuthController.login);

/**
 * @route POST /api/admin-auth/firebase-login
 * @desc Login admin with Firebase ID token
 * @access Public
 */
router.post('/firebase-login', adminAuthController.firebaseLogin);

/**
 * @route POST /api/admin-auth/register
 * @desc Register a new admin
 * @access Public (should be protected in production)
 */
router.post('/register', adminAuthController.register);

/**
 * @route GET /api/admin-auth/me
 * @desc Get current admin profile
 * @access Protected (requires JWT)
 */
router.get('/me', require('../middleware/authMiddleware').authenticateToken, (req, res, next) => {
    // Map userId to adminId for admin routes
    req.adminId = req.userId || req.user?.userId || req.user?.adminId;
    next();
}, adminAuthController.getProfile);

module.exports = router;
