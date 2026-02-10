const Agent = require('../models/Agent');
const agentService = require('./agentService');

class HierarchyService {
    /**
     * Get commission distribution for an agent and their upline
     * @param {Object} agent - The agent who found the investor
     * @param {Array} allAgents - All agents in the system
     * @returns {Array} Commission distribution
     */
    getCommissionDistribution(agent, allAgents) {
        const distribution = [];

        // For Master Agents, they keep 100%
        if (agent.type === 'Master Agent') {
            distribution.push({
                userId: agent.userId,
                name: agent.fullName || `${agent.firstName} ${agent.lastName}`,
                agentCode: agent.agentCode,
                agentNumber: agent.agentNumber,
                type: agent.type,
                commission: 100
            });
            return distribution;
        }

        // Get the commission numbers from the agent code
        const numbers = agent.commissionNumbers || agentService.getAgentNumbers(agent.agentCode);

        // Add the current agent
        distribution.push({
            userId: agent.userId,
            name: agent.fullName || `${agent.firstName} ${agent.lastName}`,
            agentCode: agent.agentCode,
            agentNumber: agent.agentNumber,
            type: agent.type,
            commission: 70 // Both Agent and Consultant get 70%
        });

        // If this is an Agent, Master Agent gets 30%
        if (agent.type === 'Agent' && numbers.masterAgent) {
            const masterAgent = this.findAgentByNumber(numbers.masterAgent, allAgents);
            if (masterAgent) {
                distribution.push({
                    userId: masterAgent.userId,
                    name: masterAgent.fullName || `${masterAgent.firstName} ${masterAgent.lastName}`,
                    agentCode: masterAgent.agentCode,
                    agentNumber: masterAgent.agentNumber,
                    type: masterAgent.type,
                    commission: 30 // Master Agent gets 30% from Agent's sales
                });
            }
            return distribution;
        }

        // If this is a Consultant, distribute remaining 30%
        if (agent.type === 'Consultant Agent') {
            // Add the immediate agent (20%)
            if (numbers.agent) {
                const immediateAgent = this.findAgentByNumber(numbers.agent, allAgents);
                if (immediateAgent) {
                    distribution.push({
                        userId: immediateAgent.userId,
                        name: immediateAgent.fullName || `${immediateAgent.firstName} ${immediateAgent.lastName}`,
                        agentCode: immediateAgent.agentCode,
                        agentNumber: immediateAgent.agentNumber,
                        type: immediateAgent.type,
                        commission: 20
                    });
                }
            }

            // Add the master agent (10%)
            if (numbers.masterAgent) {
                const masterAgent = this.findAgentByNumber(numbers.masterAgent, allAgents);
                if (masterAgent) {
                    distribution.push({
                        userId: masterAgent.userId,
                        name: masterAgent.fullName || `${masterAgent.firstName} ${masterAgent.lastName}`,
                        agentCode: masterAgent.agentCode,
                        agentNumber: masterAgent.agentNumber,
                        type: masterAgent.type,
                        commission: 10
                    });
                }
            }
        }

        return distribution;
    }

    /**
     * Find agent by their agent number
     * @param {string} agentNumber - The agent number to find
     * @param {Array} agents - All agents
     * @returns {Object|null} The agent with the matching number
     */
    findAgentByNumber(agentNumber, agents) {
        return agents.find(agent => {
            // Check in agent's current data if available
            if (agent.agentNumber === agentNumber) {
                return true;
            }

            // Check in commission numbers
            const numbers = agent.commissionNumbers || agentService.getAgentNumbers(agent.agentCode);
            return numbers.currentAgent === agentNumber;
        });
    }

    /**
     * Find all recruits for an agent
     * @param {string} agentCode - The recruiter's agent code
     * @param {Array} agents - All agents
     * @returns {Array} List of recruited agents
     */
    findRecruits(agentCode, agents) {
        if (!agentCode) return [];

        const parts = agentCode.split('-');
        if (parts.length !== 3) return [];

        const currentAgentNumber = agentService.getAgentNumbers(agentCode).currentAgent;

        return agents.filter(agent => {
            const numbers = agentService.getAgentNumbers(agent.agentCode);

            // For Master Agent: look for agents where masterAgent number matches
            if (parts[1] === '00000') {
                return numbers.masterAgent === currentAgentNumber;
            }

            // For Agent: look for consultants where agent number matches
            if (parts[2] === '00000') {
                return numbers.agent === currentAgentNumber;
            }

            return false;
        });
    }

    /**
     * Get agent hierarchy chain for commission distribution
     * @param {string} agentCode - The agent code to check
     * @returns {Promise<Object>} Hierarchy chain with commission details
     */
    async getAgentHierarchy(agentCode) {
        try {
            const agents = await Agent.findAll({ status: 'active' });
            const targetAgent = agents.find(a => a.agentCode === agentCode);

            if (!targetAgent) {
                throw new Error('Agent not found');
            }

            const commissionDistribution = this.getCommissionDistribution(targetAgent, agents);

            const response = {
                currentAgent: {
                    userId: targetAgent.userId,
                    name: targetAgent.fullName || `${targetAgent.firstName} ${targetAgent.lastName}`,
                    agentCode: targetAgent.agentCode,
                    agentNumber: targetAgent.agentNumber,
                    type: targetAgent.type,
                    commission: commissionDistribution[0].commission,
                    recruits: targetAgent.recruits || []
                },
                masterAgent: null,
                agent: null,
                commissionDistribution,
                commissionNumbers: targetAgent.commissionNumbers || agentService.getAgentNumbers(targetAgent.agentCode)
            };

            // Set upline agents directly from commission distribution
            if (commissionDistribution.length > 1) {
                // Second in distribution is always the immediate upline
                const immediateUpline = agents.find(a => a.userId === commissionDistribution[1].userId);
                if (immediateUpline) {
                    response.agent = {
                        userId: immediateUpline.userId,
                        name: immediateUpline.fullName || `${immediateUpline.firstName} ${immediateUpline.lastName}`,
                        agentCode: immediateUpline.agentCode,
                        agentNumber: immediateUpline.agentNumber,
                        type: immediateUpline.type,
                        commission: commissionDistribution[1].commission,
                        recruits: immediateUpline.recruits || []
                    };
                }

                // Third in distribution is the master agent (if exists)
                if (commissionDistribution[2]) {
                    const masterAgent = agents.find(a => a.userId === commissionDistribution[2].userId);
                    if (masterAgent) {
                        response.masterAgent = {
                            userId: masterAgent.userId,
                            name: masterAgent.fullName || `${masterAgent.firstName} ${masterAgent.lastName}`,
                            agentCode: masterAgent.agentCode,
                            agentNumber: masterAgent.agentNumber,
                            type: masterAgent.type,
                            commission: commissionDistribution[2].commission,
                            recruits: masterAgent.recruits || []
                        };
                    }
                }
            }

            return response;
        } catch (error) {
            console.error('Error getting agent hierarchy:', error);
            throw error;
        }
    }
}

module.exports = new HierarchyService();


