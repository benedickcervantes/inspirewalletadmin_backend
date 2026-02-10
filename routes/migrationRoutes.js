const express = require('express');
const router = express.Router();
const migrationController = require('../controllers/migrationController');
const validateRequest = require('../middleware/validateRequest');
const { authLimiter } = require('../middleware/rateLimiters');
const { migrationCheckSchema, migrationSetupSchema } = require('../validation/schemas');

// Migration routes (public, but require Firebase token)
router.post('/check-status', authLimiter, validateRequest({ body: migrationCheckSchema }), migrationController.checkMigrationStatus);
router.post('/setup-password', authLimiter, validateRequest({ body: migrationSetupSchema }), migrationController.setupPassword);
router.post('/migrate', authLimiter, validateRequest({ body: migrationSetupSchema }), migrationController.migrateUser); // Alias for setup-password

module.exports = router;

