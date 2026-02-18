const express = require('express');
const router = express.Router();
const timeDepositController = require('../controllers/timeDepositController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/requireAdmin');
const validateRequest = require('../middleware/validateRequest');
const { timeDepositQuoteBodySchema } = require('../validation/schemas');

router.use(authenticateToken);
router.use(requireAdmin);

router.post('/quote', validateRequest({ body: timeDepositQuoteBodySchema }), timeDepositController.quote);

module.exports = router;