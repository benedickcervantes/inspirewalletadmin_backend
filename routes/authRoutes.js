const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { authLimiter } = require('../middleware/rateLimiters');
const { registerSchema, loginSchema, firebaseLoginSchema, refreshSchema } = require('../validation/schemas');

// Public routes
router.post('/register', authLimiter, validateRequest({ body: registerSchema }), authController.register);
router.post('/login', authLimiter, validateRequest({ body: loginSchema }), authController.login);
router.post('/firebase-login', authLimiter, validateRequest({ body: firebaseLoginSchema }), authController.firebaseLogin);
router.post('/refresh', authLimiter, validateRequest({ body: refreshSchema }), authController.refresh);
router.post('/logout', validateRequest({ body: refreshSchema }), authController.logout);

// Protected routes
router.get('/profile', authenticateToken, authController.getProfile);

module.exports = router;


