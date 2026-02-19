const admin = require('firebase-admin');

class AgentHierarchyController {
    /**
     * Parse agent code to extract master and agent IDs
     * Format: XXXXX-YYYYY-ZZZZZ where:
     * - XXXXX: Master agent ID
     * - YYYYY: Direct agent ID
     * - ZZZZZ: Sub-agent ID (if applicable)
     */
    parseAgentCode(agentCode) {
        if (!agentCode) return null;
        
        const parts = agentCode.split('-');
        if (parts.length !== 3) return null;
        
        return {
            masterAgentId: parts[0],
            agentId: parts[1],
            subAgentId: parts[2]
        };
    }

    /**
     * Get agent hierarchy by agent number
     */
    async getAgentHierarchyByNumber(req, res) {
        try {
            const { agentNumber } = req.params;
            
            if (!agentNumber) {
                return res.status(400).json({
                    success: false,
                    error: 'Agent number is required'
                });
            }

            console.log(`[AGENT-HIERARCHY] Fetching hierarchy for agent number: ${agentNumber}`);

            // Find all users with this agent number
            const usersRef = admin.firestore().collection('users');
            const snapshot = await usersRef.where('agentNumber', '==', agentNumber).get();

            if (snapshot.empty) {
                return res.status(404).json({
                    success: false,
                    error: `No agent found with number: ${agentNumber}`
                });
            }

            const agents = [];
            const agentIds = [];

            // Collect all agents with this number
            snapshot.forEach(doc => {
                const data = doc.data();
                agents.push({
                    userId: doc.id,
                    name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown',
                    email: data.emailAddress || data.email || '',
                    agentNumber: data.agentNumber || '',
                    agentCode: data.agentCode || '',
                    accountNumber: data.accountNumber || ''
                });
                agentIds.push(doc.id);
            });

            console.log(`[AGENT-HIERARCHY] Found ${agents.length} agent(s)`);

            // Build hierarchy for each agent
            const hierarchies = [];
            for (const agent of agents) {
                const hierarchy = await this.buildAgentHierarchy(agent);
                hierarchies.push(hierarchy);
            }

            // Attach hierarchy to each agent
            agents.forEach((agent, index) => {
                agent.hierarchy = hierarchies[index];
            });

            // Calculate summary statistics
            const allUplineIds = new Set();
            const allDownlineIds = new Set();

            agents.forEach(agent => {
                if (agent.hierarchy.upline) {
                    if (agent.hierarchy.upline.masterAgent) {
                        allUplineIds.add(agent.hierarchy.upline.masterAgent.userId);
                    }
                    if (agent.hierarchy.upline.agent) {
                        allUplineIds.add(agent.hierarchy.upline.agent.userId);
                    }
                }
                agent.hierarchy.downline.forEach(d => allDownlineIds.add(d.userId));
            });

            const response = {
                success: true,
                data: {
                    agentNumber,
                    totalAgentsFound: agents.length,
                    agents,
                    summary: {
                        uniqueUplineCount: allUplineIds.size,
                        uniqueDownlineCount: allDownlineIds.size
                    }
                }
            };

            console.log(`[AGENT-HIERARCHY] Returning hierarchy with ${allUplineIds.size} upline and ${allDownlineIds.size} downline`);

            res.json(response);

        } catch (error) {
            console.error('[AGENT-HIERARCHY] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch agent hierarchy',
                details: error.message
            });
        }
    }

    /**
     * Build complete hierarchy for an agent
     */
    async buildAgentHierarchy(agent) {
        const hierarchy = {
            upline: null,
            downline: [],
            uplineCount: 0,
            downlineCount: 0
        };

        try {
            // Parse agent code to find upline
            const parsed = this.parseAgentCode(agent.agentCode);
            
            if (parsed) {
                // Find upline agents
                const upline = await this.findUplineAgents(parsed);
                hierarchy.upline = upline;
                
                // Count upline
                let count = 0;
                if (upline.masterAgent) count++;
                if (upline.agent) count++;
                hierarchy.uplineCount = count;
            }

            // Find downline agents (agents who have this agent in their code)
            const downline = await this.findDownlineAgents(agent.agentCode);
            hierarchy.downline = downline;
            hierarchy.downlineCount = downline.length;

        } catch (error) {
            console.error('[AGENT-HIERARCHY] Error building hierarchy:', error);
        }

        return hierarchy;
    }

    /**
     * Find upline agents based on parsed agent code
     */
    async findUplineAgents(parsed) {
        const upline = {
            masterAgent: null,
            agent: null
        };

        try {
            const usersRef = admin.firestore().collection('users');

            // Find master agent (if not 00000)
            if (parsed.masterAgentId && parsed.masterAgentId !== '00000') {
                const masterSnapshot = await usersRef
                    .where('agentNumber', '==', parsed.masterAgentId)
                    .limit(1)
                    .get();

                if (!masterSnapshot.empty) {
                    const doc = masterSnapshot.docs[0];
                    const data = doc.data();
                    upline.masterAgent = {
                        userId: doc.id,
                        name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown',
                        email: data.emailAddress || data.email || '',
                        agentNumber: data.agentNumber || '',
                        agentCode: data.agentCode || ''
                    };
                }
            }

            // Find direct agent (if not 00000)
            if (parsed.agentId && parsed.agentId !== '00000') {
                const agentSnapshot = await usersRef
                    .where('agentNumber', '==', parsed.agentId)
                    .limit(1)
                    .get();

                if (!agentSnapshot.empty) {
                    const doc = agentSnapshot.docs[0];
                    const data = doc.data();
                    upline.agent = {
                        userId: doc.id,
                        name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown',
                        email: data.emailAddress || data.email || '',
                        agentNumber: data.agentNumber || '',
                        agentCode: data.agentCode || ''
                    };
                }
            }

        } catch (error) {
            console.error('[AGENT-HIERARCHY] Error finding upline:', error);
        }

        return upline;
    }

    /**
     * Find downline agents (agents who have this agent's code in their agentCode)
     */
    async findDownlineAgents(agentCode) {
        const downline = [];

        try {
            if (!agentCode) return downline;

            const usersRef = admin.firestore().collection('users');
            
            // Get all users and filter in memory (Firestore doesn't support "contains" queries)
            const snapshot = await usersRef.get();

            snapshot.forEach(doc => {
                const data = doc.data();
                const theirCode = data.agentCode || '';
                
                // Check if this agent's code appears in their code (but not the same agent)
                if (theirCode && theirCode !== agentCode && theirCode.includes(agentCode.split('-')[0])) {
                    downline.push({
                        userId: doc.id,
                        name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown',
                        email: data.emailAddress || data.email || '',
                        agentNumber: data.agentNumber || '',
                        agentCode: data.agentCode || '',
                        hierarchy: {
                            downline: [],
                            uplineCount: 0,
                            downlineCount: 0
                        }
                    });
                }
            });

        } catch (error) {
            console.error('[AGENT-HIERARCHY] Error finding downline:', error);
        }

        return downline;
    }
}

module.exports = new AgentHierarchyController();
