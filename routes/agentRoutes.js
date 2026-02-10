const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const validateRequest = require('../middleware/validateRequest');
const { agentGenerateSchema, agentCodeParamsSchema } = require('../validation/schemas');

// Apply API key authentication to all routes
router.use(apiKeyAuth);

// Read-only routes
router.get('/', agentController.getAllAgents);
router.get('/:agentCode', validateRequest({ params: agentCodeParamsSchema }), agentController.getAgentByCode);
router.get('/:agentCode/hierarchy', validateRequest({ params: agentCodeParamsSchema }), agentController.getAgentHierarchy);

// Generate agent code route (with validation middleware)
router.post('/generate-code', validateRequest({ body: agentGenerateSchema }), agentController.generateAgentCode);

module.exports = router;


