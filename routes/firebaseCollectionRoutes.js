const express = require('express');
const router = express.Router();
const firebaseCollectionController = require('../controllers/firebaseCollectionController');
const { authenticateToken } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { firebaseCollectionParamsSchema, firebaseCollectionQuerySchema } = require('../validation/schemas');

// All routes require authentication
router.use(authenticateToken);

// GET /api/firebase-collections/:collection
router.get(
    '/:collection',
    validateRequest({ params: firebaseCollectionParamsSchema, query: firebaseCollectionQuerySchema }),
    firebaseCollectionController.getCollection
);

module.exports = router;
