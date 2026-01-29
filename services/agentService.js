const Agent = require('../models/Agent');
const { AgentTypeFactory, MasterAgent, Agent: AgentType, ConsultantAgent } = require('../models/AgentType');

/**
 * AgentService - Business logic for agent operations
 * Uses polymorphic AgentType classes for commission calculations
 * 
 * @class AgentService
 */
class AgentService {
    /**
     * Validate agent code format
     * @param {string} agentCode - The agent code to validate
     * @returns {Object} Validation result with status and error message if any
     */
    validateAgentCode(agentCode) {
        if (!agentCode) {
            return {
                isValid: false,
                error: 'Agent code is missing'
            };
        }

        // Check format XXXXX-XXXXX-XXXXX (all parts can be alphanumeric)
        if (!/^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/.test(agentCode)) {
            return {
                isValid: false,
                error: `Invalid agent code format: ${agentCode}. Expected format: XXXXX-XXXXX-XXXXX (alphanumeric)`
            };
        }

        const parts = agentCode.split('-');
        if (parts.length !== 3) {
            return {
                isValid: false,
                error: `Invalid agent code structure: ${agentCode}. Must have exactly 3 parts separated by hyphens`
            };
        }

        // Each part should be exactly 5 characters
        if (parts.some(part => part.length !== 5)) {
            return {
                isValid: false,
                error: `Invalid agent code part length: ${agentCode}. Each part must be exactly 5 characters`
            };
        }

        return { isValid: true };
    }

    /**
     * Determine agent type based on agent code pattern
     * Uses polymorphic AgentType classes
     * @param {string} agentCode - Format: XXXXX-XXXXX-XXXXX (each part is an agent number)
     * @returns {string|null} Agent type name
     */
    determineAgentType(agentCode) {
        const agentType = AgentTypeFactory.fromAgentCode(agentCode);
        return agentType ? agentType.getTypeName() : null;
    }

    /**
     * Get AgentType instance from agent code
     * @param {string} agentCode - Agent code
     * @returns {AgentType|null} Agent type instance
     */
    getAgentTypeInstance(agentCode) {
        return AgentTypeFactory.fromAgentCode(agentCode);
    }

    /**
     * Calculate commission for an agent
     * Uses polymorphic commission calculation
     * @param {string} agentCode - Agent code
     * @param {number} amount - Transaction amount
     * @returns {number} Commission amount
     */
    calculateCommission(agentCode, amount) {
        const agentType = AgentTypeFactory.fromAgentCode(agentCode);
        if (agentType) {
            return agentType.calculateCommission(amount);
        }
        return 0;
    }

    /**
     * Calculate commissions for entire hierarchy
     * @param {string} agentCode - Starting agent code
     * @param {number} amount - Transaction amount
     * @returns {Promise<Array>} Array of commission breakdowns
     */
    async calculateHierarchyCommissions(agentCode, amount) {
        const commissions = [];
        const hierarchy = await Agent.getHierarchy(agentCode);

        for (const agent of hierarchy) {
            const agentType = AgentTypeFactory.fromAgentCode(agent.agentCode);
            if (agentType) {
                commissions.push({
                    agentCode: agent.agentCode,
                    agentNumber: agent.agentNumber,
                    fullName: agent.fullName || `${agent.firstName} ${agent.lastName}`,
                    type: agentType.getTypeName(),
                    commissionPercentage: agentType.getCommissionPercentage(),
                    commissionAmount: agentType.calculateCommission(amount)
                });
            }
        }

        return commissions;
    }

    /**
     * Get agent numbers from agent code
     * @param {string} agentCode - Format: XXXXX-XXXXX-XXXXX
     * @returns {Object} Agent numbers in the chain with their roles
     */
    getAgentNumbers(agentCode) {
        const parts = agentCode.split('-');
        if (parts.length !== 3) return {};

        const numbers = {};

        // The rightmost non-zero part is the current agent
        if (parts[2] !== '00000') {
            numbers.currentAgent = parts[2];
            numbers.agent = parts[1];
            numbers.masterAgent = parts[0];
        } else if (parts[1] !== '00000') {
            numbers.currentAgent = parts[1];
            numbers.masterAgent = parts[0];
        } else {
            numbers.currentAgent = parts[0];
        }

        return numbers;
    }

    /**
     * Generate agent code for new registration based on referrer and agent number
     * @param {string} referrerCode - The referrer's agent code
     * @param {string} newAgentNumber - The new agent's number (XXXXX)
     * @returns {Promise<Object>} Generated agent code and details
     */
    async generateAgentCode(referrerCode, newAgentNumber) {
        try {
            // Validate new agent number format
            if (!newAgentNumber || !/^[A-Z0-9]{5}$/.test(newAgentNumber)) {
                throw new Error('Invalid agent number. Must be exactly 5 alphanumeric characters.');
            }

            // Get referrer's information from Firestore
            const referrer = await Agent.findByCode(referrerCode);
            if (!referrer) {
                throw new Error('Referrer not found');
            }

            const referrerParts = referrerCode.split('-');
            if (referrerParts.length !== 3) {
                throw new Error('Invalid referrer code format');
            }

            // Get referrer's type using polymorphism
            const referrerType = AgentTypeFactory.fromAgentCode(referrerCode);
            if (!referrerType) {
                throw new Error('Invalid referrer type');
            }

            // Check if referrer can recruit
            if (!referrerType.canRecruit()) {
                throw new Error(`${referrerType.getTypeName()} cannot recruit new agents`);
            }

            let generatedCode;
            let newAgentTypeInstance;

            // Generate code based on referrer type
            if (referrerType instanceof MasterAgent) {
                generatedCode = `${referrerParts[0]}-${newAgentNumber}-00000`;
                newAgentTypeInstance = new AgentType();
            } else if (referrerType instanceof AgentType) {
                generatedCode = `${referrerParts[0]}-${referrerParts[1]}-${newAgentNumber}`;
                newAgentTypeInstance = new ConsultantAgent();
            } else if (referrerType instanceof ConsultantAgent) {
                // Consultant agents shouldn't be able to recruit (handled above)
                throw new Error('Consultant agents cannot recruit');
            } else {
                throw new Error('Invalid referrer type');
            }

            // Validate generated code
            const validation = this.validateAgentCode(generatedCode);
            if (!validation.isValid) {
                throw new Error(`Generated invalid agent code: ${validation.error}`);
            }

            // Check if code already exists
            const codeExists = await Agent.codeExists(generatedCode);
            if (codeExists) {
                throw new Error('Generated agent code already exists. Please try again.');
            }

            // Get commission numbers for the new code
            const commissionNumbers = this.getAgentNumbers(generatedCode);

            return {
                success: true,
                data: {
                    agentCode: generatedCode,
                    agentNumber: newAgentNumber,
                    type: newAgentTypeInstance.getTypeName(),
                    typeInfo: newAgentTypeInstance.toJSON(),
                    commissionNumbers,
                    referrer: {
                        userId: referrer.userId,
                        name: referrer.fullName || `${referrer.firstName} ${referrer.lastName}`,
                        agentCode: referrer.agentCode,
                        type: referrerType.getTypeName()
                    }
                }
            };
        } catch (error) {
            console.error('Error generating agent code:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get agent by code
     * @param {string} agentCode - Agent code
     * @returns {Promise<Object|null>} Agent or null
     */
    async getAgentByCode(agentCode) {
        return await Agent.findByCode(agentCode);
    }

    /**
     * Get agent by code with type information
     * @param {string} agentCode - Agent code
     * @returns {Promise<Object|null>} Agent with type info or null
     */
    async getAgentByCodeWithType(agentCode) {
        return await Agent.findByCodeWithType(agentCode);
    }

    /**
     * Get agent by number
     * @param {string} agentNumber - Agent number
     * @returns {Promise<Object|null>} Agent or null
     */
    async getAgentByNumber(agentNumber) {
        return await Agent.findByNumber(agentNumber);
    }

    /**
     * Get all agents
     * @returns {Promise<Array>} Array of agents
     */
    async getAllAgents() {
        return await Agent.findAll({ status: 'active' });
    }

    /**
     * Get agents by type
     * @param {string} typeName - Agent type name
     * @returns {Promise<Array>} Array of agents
     */
    async getAgentsByType(typeName) {
        return await Agent.findByType(typeName);
    }

    /**
     * Get all available agent types
     * @returns {Array} Array of agent type info objects
     */
    getAvailableAgentTypes() {
        return AgentTypeFactory.getAllTypes();
    }

    /**
     * Get agent hierarchy (upline chain)
     * @param {string} agentCode - Agent code
     * @returns {Promise<Array>} Array of agents in hierarchy
     */
    async getAgentHierarchy(agentCode) {
        return await Agent.getHierarchy(agentCode);
    }
}

// Export singleton instance for backward compatibility
// Also export the class for testing and dependency injection
const agentServiceInstance = new AgentService();
module.exports = agentServiceInstance;
module.exports.AgentService = AgentService;
