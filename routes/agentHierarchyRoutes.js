const express = require('express');
const router = express.Router();
const agentHierarchyController = require('../controllers/agentHierarchyController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// GET /api/agent-hierarchy/number/:agentNumber
router.get('/number/:agentNumber', (req, res) => 
    agentHierarchyController.getAgentHierarchyByNumber(req, res)
);

module.exports = router;
