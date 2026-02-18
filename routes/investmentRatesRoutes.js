const express = require('express');
const router = express.Router();
const investmentRatesController = require('../controllers/investmentRatesController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/requireAdmin');
const validateRequest = require('../middleware/validateRequest');
const { investmentRatesUpdateSchema, docIdParamsSchema } = require('../validation/schemas');

// All routes require authentication
router.use(authenticateToken);

// GET /api/investment-rates/:docId - Get investment rates
router.get(
    '/:docId',
    validateRequest({ params: docIdParamsSchema }),
    investmentRatesController.getRates
);

// PUT /api/investment-rates/:docId - Update investment rates (admin only)
router.put(
    '/:docId',
    requireAdmin,
    validateRequest({ params: docIdParamsSchema, body: investmentRatesUpdateSchema }),
    investmentRatesController.updateRates
);

module.exports = router;
