const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All dashboard routes require authentication
router.use(authenticateToken);

// GET /api/dashboard/summary
router.get('/summary', dashboardController.getSummary);

module.exports = router;
