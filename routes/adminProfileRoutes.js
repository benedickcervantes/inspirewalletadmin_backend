const express = require('express');
const router = express.Router();
const adminProfileController = require('../controllers/adminProfileController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// Profile routes
router.get('/profile', adminProfileController.getProfile);
router.put('/profile/username', adminProfileController.updateUsername);
router.put('/profile/email', adminProfileController.updateEmail);
router.put('/profile/password', adminProfileController.updatePassword);

// Investment rates routes
router.get('/settings/investment-rates', adminProfileController.getInvestmentRates);
router.put('/settings/investment-rates', adminProfileController.updateInvestmentRates);

// User management routes
router.post('/users/password-reset', adminProfileController.sendPasswordReset);

module.exports = router;
