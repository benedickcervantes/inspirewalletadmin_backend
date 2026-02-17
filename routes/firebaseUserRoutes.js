const express = require('express');
const router = express.Router();
const firebaseUserController = require('../controllers/firebaseUserController');
const timeDepositController = require('../controllers/timeDepositController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/requireAdmin');
const validateRequest = require('../middleware/validateRequest');
const {
    userListQuerySchema,
    userIdParamsSchema,
    timeDepositCreateBodySchema,
    timeDepositCreateParamsSchema
} = require('../validation/schemas');

// All Firebase user routes require authentication
router.use(authenticateToken);

// GET /api/firebase-users - Get all Firebase users with pagination
router.get('/', validateRequest({ query: userListQuerySchema }), firebaseUserController.getAllUsers);

// GET /api/firebase-users/:id - Get Firebase user by ID
router.get('/:id', validateRequest({ params: userIdParamsSchema }), firebaseUserController.getUserById);

// POST /api/firebase-users/:id/time-deposits - Create user time deposit
router.post(
    '/:id/time-deposits',
    requireAdmin,
    validateRequest({ params: timeDepositCreateParamsSchema, body: timeDepositCreateBodySchema }),
    timeDepositController.create
);

module.exports = router;
