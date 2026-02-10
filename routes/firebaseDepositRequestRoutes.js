const express = require('express');
const router = express.Router();
const firebaseDepositRequestController = require('../controllers/firebaseDepositRequestController');
const { authenticateToken } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { subcollectionQuerySchema } = require('../validation/schemas');

// All Firebase deposit request routes require authentication
router.use(authenticateToken);

// GET /api/firebase-deposit-requests
router.get('/', validateRequest({ query: subcollectionQuerySchema }), firebaseDepositRequestController.getDepositRequests);

module.exports = router;
