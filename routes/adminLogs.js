const express = require('express');
const router = express.Router();
const {
  getAdminLogs,
  getAdminLogById,
  getAdminEmails,
  getActions
} = require('../controllers/adminLogsController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// Get all admin logs with pagination and filtering
router.get('/', getAdminLogs);

// Get unique admin emails for filtering
router.get('/admins', getAdminEmails);

// Get unique actions for filtering
router.get('/actions', getActions);

// Get a single admin log by ID
router.get('/:id', getAdminLogById);

module.exports = router;
