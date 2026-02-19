const express = require('express');
const router = express.Router();
const firebaseDepositRequestController = require('../controllers/firebaseDepositRequestController');
const { authenticateToken } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { firebaseDepositRequestQuerySchema } = require('../validation/schemas');

// All Firebase deposit request routes require authentication
router.use(authenticateToken);

// GET /api/firebase-deposit-requests/stats (must be before /)
router.get('/stats', firebaseDepositRequestController.getDepositRequestStats);

// GET /api/firebase-deposit-requests
router.get('/', validateRequest({ query: firebaseDepositRequestQuerySchema }), firebaseDepositRequestController.getDepositRequests);

module.exports = router;
