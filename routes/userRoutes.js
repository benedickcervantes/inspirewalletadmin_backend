const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const {
    userListQuerySchema,
    userIdParamsSchema,
    userEmailParamsSchema,
    userProfileUpdateSchema,
    userSubcollectionParamsSchema,
    userSubcollectionQuerySchema
} = require('../validation/schemas');

// All user routes require authentication
router.use(authenticateToken);

// GET /api/users - Get all users with pagination
router.get('/', validateRequest({ query: userListQuerySchema }), userController.getAllUsers);

// GET /api/users/migration-summary - Get migration summary counts
router.get('/migration-summary', userController.getMigrationSummary);

// PUT /api/users/profile - Update current user profile
router.put('/profile', validateRequest({ body: userProfileUpdateSchema }), userController.updateProfile);

// GET /api/users/subcollections/:name - Get current user subcollection
router.get(
    '/subcollections/:name',
    validateRequest({ params: userSubcollectionParamsSchema, query: userSubcollectionQuerySchema }),
    userController.getUserSubcollection
);

// GET /api/users/:id - Get user by ID
router.get('/:id', validateRequest({ params: userIdParamsSchema }), userController.getUserById);

// GET /api/users/email/:email - Get user by email
router.get('/email/:email', validateRequest({ params: userEmailParamsSchema }), userController.getUserByEmail);

module.exports = router;
