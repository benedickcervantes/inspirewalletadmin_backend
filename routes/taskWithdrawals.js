const express = require('express');
const router = express.Router();
const {
  getTaskWithdrawals,
  updateWithdrawalStatus,
  getTaskWithdrawalById
} = require('../controllers/taskWithdrawalController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// GET /api/task-withdrawals - Get all task withdrawal requests with filters
router.get('/', getTaskWithdrawals);

// GET /api/task-withdrawals/:id - Get single task withdrawal by ID
router.get('/:id', getTaskWithdrawalById);

// PUT /api/task-withdrawals/:id/status - Update withdrawal status (approve/reject)
router.put('/:id/status', updateWithdrawalStatus);

module.exports = router;
