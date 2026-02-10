const agentService = require('../services/agentService');
const hierarchyService = require('../services/hierarchyService');
const Agent = require('../models/Agent');

class AgentController {
    constructor() {
        // Bind methods to maintain 'this' context
        this.getAllAgents = this.getAllAgents.bind(this);
        this.getAgentByCode = this.getAgentByCode.bind(this);
        this.getAgentHierarchy = this.getAgentHierarchy.bind(this);
        this.generateAgentCode = this.generateAgentCode.bind(this);
    }

    /**
     * Get all agents
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getAllAgents(req, res) {
        try {
            const agents = await agentService.getAllAgents();
            res.json({
                success: true,
                data: agents
            });
        } catch (error) {
            console.error('Controller error fetching agents:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch agents'
            });
        }
    }

    /**
     * Get agent by code
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getAgentByCode(req, res) {
        try {
            const { agentCode } = req.params;
            const agent = await agentService.getAgentByCode(agentCode);

            if (!agent) {
                return res.status(404).json({
                    success: false,
                    error: 'Agent not found'
                });
            }

            res.json({
                success: true,
                data: agent
            });
        } catch (error) {
            console.error('Controller error fetching agent by code:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch agent'
            });
        }
    }

    /**
     * Get agent hierarchy for commission distribution
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getAgentHierarchy(req, res) {
        try {
            const { agentCode } = req.params;
            const hierarchy = await hierarchyService.getAgentHierarchy(agentCode);

            res.json({
                success: true,
                data: hierarchy
            });
        } catch (error) {
            console.error('Controller error getting agent hierarchy:', error);
            res.status(error.message === 'Agent not found' ? 404 : 500).json({
                success: false,
                error: error.message || 'Failed to get agent hierarchy'
            });
        }
    }

    /**
     * Generate agent code for new registration
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async generateAgentCode(req, res) {
        try {
            const { referrerCode, agentNumber } = req.body;

            if (!referrerCode || !agentNumber) {
                return res.status(400).json({
                    success: false,
                    error: 'Referrer code and agent number are required'
                });
            }

            const result = await agentService.generateAgentCode(referrerCode, agentNumber);

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Controller error generating agent code:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to generate agent code'
            });
        }
    }
}

module.exports = new AgentController();


