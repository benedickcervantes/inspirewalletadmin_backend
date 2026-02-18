const express = require('express');
const router = express.Router();
const subcollectionController = require('../controllers/subcollectionController');
const { authenticateToken } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { subcollectionQuerySchema } = require('../validation/schemas');

// All routes require authentication
router.use(authenticateToken);

// GET /api/subcollections/bank-applications
router.get('/bank-applications', validateRequest({ query: subcollectionQuerySchema }), subcollectionController.getBankApplications);

// GET /api/subcollections/deposit-requests
router.get('/deposit-requests', validateRequest({ query: subcollectionQuerySchema }), subcollectionController.getDepositRequests);

// GET /api/subcollections/maya-applications
router.get('/maya-applications', validateRequest({ query: subcollectionQuerySchema }), subcollectionController.getMayaApplications);

// GET /api/subcollections/travel-applications
router.get('/travel-applications', validateRequest({ query: subcollectionQuerySchema }), subcollectionController.getTravelApplications);

// GET /api/subcollections/tasks
router.get('/tasks', validateRequest({ query: subcollectionQuerySchema }), subcollectionController.getTasks);

// GET /api/subcollections/withdrawals
router.get('/withdrawals', validateRequest({ query: subcollectionQuerySchema }), subcollectionController.getWithdrawals);

module.exports = router;
