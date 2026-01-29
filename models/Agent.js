const BaseModel = require('./BaseModel');
const { AgentTypeFactory } = require('./AgentType');

/**
 * AgentModel - Handles all agent-related database operations
 * Extends BaseModel for common CRUD functionality
 *
 * @class AgentModel
 * @extends BaseModel
 */
class AgentModel extends BaseModel {
    constructor() {
        super('agents');
    }

    /**
     * Create a new agent (uses agentCode as document ID)
     * @param {Object} agentData - Agent data
     * @returns {Promise<Object>} Created agent
     */
    async create(agentData) {
        const doc = {
            ...agentData,
            createdAt: new Date(),
            updatedAt: new Date(),
            status: agentData.status || 'active',
            recruits: agentData.recruits || []
        };

        // Use agentCode as document ID for fast lookups
        if (doc.agentCode) {
            return await this.insertWithId(doc.agentCode, doc);
        }

        return await this.insertOne(doc);
    }

    /**
     * Find agent by agent code (direct doc lookup)
     * @param {string} agentCode - Agent code
     * @returns {Promise<Object|null>} Agent or null
     */
    async findByCode(agentCode) {
        // Direct document lookup by ID (agentCode is the doc ID)
        const byDocId = await this.findById(agentCode);
        if (byDocId) return byDocId;

        // Fallback to field query
        return await this.findOne({ agentCode });
    }

    /**
     * Find agent by agent number
     * @param {string} agentNumber - Agent number
     * @returns {Promise<Object|null>} Agent or null
     */
    async findByNumber(agentNumber) {
        return await this.findOne({ agentNumber });
    }

    /**
     * Find agent by user ID
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} Agent or null
     */
    async findByUserId(userId) {
        return await this.findOne({ userId });
    }

    /**
     * Find all recruits of an agent
     * @param {string} referrerCode - Referrer's agent code
     * @returns {Promise<Array>} Array of recruits
     */
    async findRecruits(referrerCode) {
        return await this.findMany({
            referrerCode,
            status: 'active'
        });
    }

    /**
     * Get all agents with optional filtering
     * @param {Object} filter - Optional filter
     * @returns {Promise<Array>} Array of agents
     */
    async findAll(filter = {}) {
        return await this.findMany(filter);
    }

    /**
     * Update agent by agent code
     * @param {string} agentCode - Agent code
     * @param {Object} updateData - Data to update
     * @returns {Promise<boolean>} Success status
     */
    async update(agentCode, updateData) {
        // Try direct doc update first (agentCode is the doc ID)
        const updated = await this.updateById(agentCode, updateData);
        if (updated) return true;

        // Fallback to field query
        return await this.updateOne({ agentCode }, updateData);
    }

    /**
     * Update agent's recruits list
     * @param {string} agentCode - Agent code
     * @param {Array} recruits - Recruits array
     * @returns {Promise<boolean>} Success status
     */
    async updateRecruits(agentCode, recruits) {
        return await this.update(agentCode, { recruits });
    }

    /**
     * Check if agent code exists
     * @param {string} agentCode - Agent code
     * @returns {Promise<boolean>} Exists status
     */
    async codeExists(agentCode) {
        // Direct doc lookup
        const doc = await this.findById(agentCode);
        if (doc) return true;

        return await this.exists({ agentCode });
    }

    /**
     * Check if agent number exists
     * @param {string} agentNumber - Agent number
     * @returns {Promise<boolean>} Exists status
     */
    async numberExists(agentNumber) {
        return await this.exists({ agentNumber });
    }

    /**
     * Get agent with its type information (polymorphic)
     * @param {string} agentCode - Agent code
     * @returns {Promise<Object|null>} Agent with type info or null
     */
    async findByCodeWithType(agentCode) {
        const agent = await this.findByCode(agentCode);
        if (!agent) return null;

        const agentType = AgentTypeFactory.fromAgentCode(agentCode);
        if (agentType) {
            return {
                ...agent,
                typeInfo: agentType.toJSON(),
                commission: {
                    percentage: agentType.getCommissionPercentage(),
                    calculate: (amount) => agentType.calculateCommission(amount)
                }
            };
        }

        return agent;
    }

    /**
     * Calculate commission for an agent
     * @param {string} agentCode - Agent code
     * @param {number} amount - Transaction amount
     * @returns {Promise<number>} Commission amount
     */
    async calculateCommission(agentCode, amount) {
        const agentType = AgentTypeFactory.fromAgentCode(agentCode);
        if (agentType) {
            return agentType.calculateCommission(amount);
        }
        return 0;
    }

    /**
     * Get agents by type
     * @param {string} typeName - Agent type name
     * @returns {Promise<Array>} Array of agents
     */
    async findByType(typeName) {
        return await this.findMany({ type: typeName, status: 'active' });
    }

    /**
     * Get agent hierarchy (upline chain)
     * @param {string} agentCode - Agent code
     * @returns {Promise<Array>} Array of agents in hierarchy
     */
    async getHierarchy(agentCode) {
        const hierarchy = [];
        const agent = await this.findByCode(agentCode);

        if (!agent) return hierarchy;
        hierarchy.push(agent);

        // Find referrer chain
        let currentReferrerCode = agent.referrerCode;
        while (currentReferrerCode) {
            const referrer = await this.findByCode(currentReferrerCode);
            if (!referrer) break;
            hierarchy.push(referrer);
            currentReferrerCode = referrer.referrerCode;
        }

        return hierarchy;
    }
}

// Export singleton instance for backward compatibility
// Also export the class for testing and dependency injection
const agentInstance = new AgentModel();
module.exports = agentInstance;
module.exports.AgentModel = AgentModel;
