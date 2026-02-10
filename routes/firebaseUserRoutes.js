const express = require('express');
const router = express.Router();
const firebaseUserController = require('../controllers/firebaseUserController');
const { authenticateToken } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { userListQuerySchema, userIdParamsSchema } = require('../validation/schemas');

// All Firebase user routes require authentication
router.use(authenticateToken);

// GET /api/firebase-users - Get all Firebase users with pagination
router.get('/', validateRequest({ query: userListQuerySchema }), firebaseUserController.getAllUsers);

// GET /api/firebase-users/:id - Get Firebase user by ID
router.get('/:id', validateRequest({ params: userIdParamsSchema }), firebaseUserController.getUserById);

module.exports = router;
