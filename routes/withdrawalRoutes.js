const express = require('express');
const router = express.Router();
const {
  getWithdrawals,
  updateWithdrawalStatus,
  getWithdrawalById
} = require('../controllers/withdrawalController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// GET /api/withdrawals - Get all withdrawal requests with filters
router.get('/', getWithdrawals);

// GET /api/withdrawals/:id - Get single withdrawal by ID
router.get('/:id', getWithdrawalById);

// PUT /api/withdrawals/:id/status - Update withdrawal status (approve/reject)
router.put('/:id/status', updateWithdrawalStatus);

module.exports = router;
