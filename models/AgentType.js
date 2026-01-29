/**
 * AgentType - Abstract base class for agent types
 * Implements polymorphism for different agent types
 * 
 * @abstract
 * @class AgentType
 */
class AgentType {
    /**
     * Create a new AgentType instance
     * @param {string} name - The type name
     */
    constructor(name) {
        if (this.constructor === AgentType) {
            throw new Error('AgentType is an abstract class and cannot be instantiated directly');
        }
        this.name = name;
    }

    /**
     * Calculate commission for a transaction
     * @abstract
     * @param {number} amount - Transaction amount
     * @returns {number} Commission amount
     */
    calculateCommission(amount) {
        throw new Error('calculateCommission() must be implemented by subclass');
    }

    /**
     * Get maximum number of direct recruits allowed
     * @abstract
     * @returns {number} Maximum recruits
     */
    getMaxRecruits() {
        throw new Error('getMaxRecruits() must be implemented by subclass');
    }

    /**
     * Get commission percentage
     * @abstract
     * @returns {number} Commission percentage (0-100)
     */
    getCommissionPercentage() {
        throw new Error('getCommissionPercentage() must be implemented by subclass');
    }

    /**
     * Check if this agent type can recruit other agents
     * @returns {boolean}
     */
    canRecruit() {
        return true;
    }

    /**
     * Get the hierarchy level (lower = higher in hierarchy)
     * @abstract
     * @returns {number} Hierarchy level
     */
    getHierarchyLevel() {
        throw new Error('getHierarchyLevel() must be implemented by subclass');
    }

    /**
     * Get type name
     * @returns {string}
     */
    getTypeName() {
        return this.name;
    }

    /**
     * Convert to plain object
     * @returns {Object}
     */
    toJSON() {
        return {
            name: this.name,
            commissionPercentage: this.getCommissionPercentage(),
            maxRecruits: this.getMaxRecruits(),
            hierarchyLevel: this.getHierarchyLevel(),
            canRecruit: this.canRecruit()
        };
    }
}

/**
 * Master Agent - Top level in the agent hierarchy
 * @class MasterAgent
 * @extends AgentType
 */
class MasterAgent extends AgentType {
    constructor() {
        super('Master Agent');
    }

    calculateCommission(amount) {
        return amount * 0.10; // 10% commission
    }

    getMaxRecruits() {
        return 100;
    }

    getCommissionPercentage() {
        return 10;
    }

    getHierarchyLevel() {
        return 1;
    }
}

/**
 * Agent - Middle level in the agent hierarchy
 * @class Agent
 * @extends AgentType
 */
class Agent extends AgentType {
    constructor() {
        super('Agent');
    }

    calculateCommission(amount) {
        return amount * 0.05; // 5% commission
    }

    getMaxRecruits() {
        return 50;
    }

    getCommissionPercentage() {
        return 5;
    }

    getHierarchyLevel() {
        return 2;
    }
}

/**
 * Consultant Agent - Bottom level in the agent hierarchy
 * @class ConsultantAgent
 * @extends AgentType
 */
class ConsultantAgent extends AgentType {
    constructor() {
        super('Consultant Agent');
    }

    calculateCommission(amount) {
        return amount * 0.02; // 2% commission
    }

    getMaxRecruits() {
        return 10;
    }

    getCommissionPercentage() {
        return 2;
    }

    getHierarchyLevel() {
        return 3;
    }

    canRecruit() {
        return false; // Consultant agents cannot recruit
    }
}

/**
 * AgentTypeFactory - Factory pattern for creating agent type instances
 * @class AgentTypeFactory
 */
class AgentTypeFactory {
    static types = {
        'Master Agent': MasterAgent,
        'Agent': Agent,
        'Consultant Agent': ConsultantAgent
    };

    /**
     * Create an agent type instance from type name
     * @param {string} typeName - The agent type name
     * @returns {AgentType|null} Agent type instance or null
     */
    static create(typeName) {
        const TypeClass = this.types[typeName];
        if (TypeClass) {
            return new TypeClass();
        }
        return null;
    }

    /**
     * Create an agent type instance from agent code
     * @param {string} agentCode - The agent code (XXXXX-XXXXX-XXXXX)
     * @returns {AgentType|null} Agent type instance or null
     */
    static fromAgentCode(agentCode) {
        if (!agentCode) return null;

        const parts = agentCode.split('-');
        if (parts.length !== 3) return null;

        // Determine type based on code pattern
        if (parts[2] !== '00000') return new ConsultantAgent();
        if (parts[1] !== '00000') return new Agent();
        if (parts[0] !== '00000') return new MasterAgent();

        return null;
    }

    /**
     * Get all available agent type names
     * @returns {string[]}
     */
    static getTypeNames() {
        return Object.keys(this.types);
    }

    /**
     * Get all agent types as objects
     * @returns {Object[]}
     */
    static getAllTypes() {
        return Object.keys(this.types).map(name => {
            const instance = new this.types[name]();
            return instance.toJSON();
        });
    }
}

module.exports = {
    AgentType,
    MasterAgent,
    Agent,
    ConsultantAgent,
    AgentTypeFactory
};
