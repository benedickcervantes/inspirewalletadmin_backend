const admin = require('firebase-admin');

class TicketController {
    /**
     * Get all tickets with filtering and pagination
     */
    async getTickets(req, res) {
        try {
            console.log(`[TICKETS] === REQUEST START ===`);
            console.log(`[TICKETS] User object:`, JSON.stringify(req.user, null, 2));
            
            const {
                page = 1,
                limit = 20,
                status = 'all',
                priority,
                category,
                assignedTo,
                search,
                sortBy = 'createdAt',
                sortOrder = 'desc',
                viewMode = 'my-tickets' // 'my-tickets' or 'all'
            } = req.query;

            const adminEmail = req.user?.email || req.user?.displayName;
            const adminUid = req.user?.adminId || req.user?.userId || req.user?.uid || req.user?.sub;

            console.log(`[TICKETS] Fetching tickets - View: ${viewMode}, Admin: ${adminEmail}, UID: ${adminUid}`);

            // Fetch admin's specialrole from Firestore (not RTDB)
            let adminRole = null;
            if (adminUid) {
                try {
                    const adminDoc = await admin.firestore()
                        .collection('adminUsers')
                        .doc(adminUid)
                        .get();
                    
                    if (adminDoc.exists) {
                        const adminData = adminDoc.data();
                        adminRole = adminData.specialrole;
                        console.log(`[TICKETS] Admin data:`, adminData);
                        console.log(`[TICKETS] Admin role: ${adminRole}`);
                    } else {
                        console.log(`[TICKETS] Admin document not found in Firestore for UID: ${adminUid}`);
                    }
                } catch (error) {
                    console.error('[TICKETS] Error fetching admin role:', error);
                }
            }

            console.log(`[TICKETS] Processing with - View: ${viewMode}, Admin: ${adminEmail}, Role: ${adminRole}`);

            // Get all users
            const usersSnapshot = await admin.firestore()
                .collection('users')
                .get();
            
            let allTickets = [];

            // Fetch tickets from each user's subcollection in parallel
            const ticketPromises = usersSnapshot.docs.map(async (userDoc) => {
                const userId = userDoc.id;
                const userData = userDoc.data();
                
                try {
                    const ticketsSnapshot = await admin.firestore()
                        .collection('users')
                        .doc(userId)
                        .collection('tickets')
                        .orderBy('createdAt', 'desc')
                        .get();

                    if (ticketsSnapshot.empty) {
                        return [];
                    }

                    return ticketsSnapshot.docs.map(ticketDoc => {
                            const ticketData = ticketDoc.data();
                            return {
                                id: ticketDoc.id,
                                userId,
                                title: ticketData.title || 'Untitled Ticket',
                                description: ticketData.description || ticketData.reason || '',
                                status: ticketData.status || 'pending',
                                priority: ticketData.priority || 'medium',
                                category: ticketData.category || 'general',
                                assignedTo: ticketData.assignedTo || 'Unassigned',
                                createdAt: ticketData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                                updatedAt: ticketData.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                                customerName: ticketData.customerName || userData.displayName || userData.email?.split('@')[0] || 'Unknown',
                                customerEmail: ticketData.customerEmail || userData.email || '',
                                requestType: ticketData.requestType || 'Help Center Ticket',
                                notes: ticketData.notes || '',
                                resolution: ticketData.resolution || '',
                                resolvedAt: ticketData.resolvedAt?.toDate?.()?.toISOString() || null,
                                closedAt: ticketData.closedAt?.toDate?.()?.toISOString() || null,
                                messages: ticketData.messages || []
                            };
                        });
                } catch (error) {
                    console.error(`Error fetching tickets for user ${userId}:`, error);
                    return [];
                }
            });

            // Wait for all ticket fetches to complete
            const ticketArrays = await Promise.all(ticketPromises);
            allTickets = ticketArrays.flat();

            // Separate pending and assigned tickets
            const pendingTickets = allTickets.filter(t => 
                t.status === 'pending' || t.assignedTo === 'Unassigned'
            );
            
            const assignedTickets = allTickets.filter(t => 
                t.status !== 'pending' && t.assignedTo !== 'Unassigned'
            );

            console.log(`[TICKETS] Total tickets: ${allTickets.length}, Pending: ${pendingTickets.length}, Assigned: ${assignedTickets.length}`);

            // Filter based on view mode
            let ticketsToReturn = assignedTickets;
            
            if (viewMode === 'my-tickets') {
                // My Tickets: Always filter by current admin's email
                ticketsToReturn = assignedTickets.filter(t => t.assignedTo === adminEmail);
                console.log(`[TICKETS] My Tickets mode: Filtered to ${ticketsToReturn.length} tickets for ${adminEmail}`);
            } else if (viewMode === 'all') {
                // All Tickets: Only superadmin can see all, others see their own
                if (adminRole === 'superadmin') {
                    ticketsToReturn = assignedTickets; // Show all
                    console.log(`[TICKETS] All Tickets mode (superadmin): Showing all ${ticketsToReturn.length} tickets`);
                } else {
                    ticketsToReturn = assignedTickets.filter(t => t.assignedTo === adminEmail);
                    console.log(`[TICKETS] All Tickets mode (regular admin): Filtered to ${ticketsToReturn.length} tickets`);
                }
            }

            // Apply filters
            let filteredTickets = ticketsToReturn;

            if (status !== 'all') {
                filteredTickets = filteredTickets.filter(t => t.status === status);
            }

            if (priority) {
                filteredTickets = filteredTickets.filter(t => t.priority === priority);
            }

            if (category) {
                filteredTickets = filteredTickets.filter(t => t.category === category);
            }

            if (assignedTo) {
                filteredTickets = filteredTickets.filter(t => t.assignedTo === assignedTo);
            }

            if (search) {
                const searchLower = search.toLowerCase();
                filteredTickets = filteredTickets.filter(t =>
                    t.title?.toLowerCase().includes(searchLower) ||
                    t.description?.toLowerCase().includes(searchLower) ||
                    t.customerName?.toLowerCase().includes(searchLower) ||
                    t.customerEmail?.toLowerCase().includes(searchLower)
                );
            }

            // Sort tickets
            filteredTickets.sort((a, b) => {
                const aVal = a[sortBy];
                const bVal = b[sortBy];
                
                if (sortOrder === 'asc') {
                    return aVal > bVal ? 1 : -1;
                }
                return aVal < bVal ? 1 : -1;
            });

            // Calculate stats
            const stats = {
                pending: pendingTickets.length,
                total: ticketsToReturn.length,
                open: ticketsToReturn.filter(t => t.status === 'open').length,
                inProgress: ticketsToReturn.filter(t => t.status === 'in-progress').length,
                resolved: ticketsToReturn.filter(t => t.status === 'resolved').length,
                closed: ticketsToReturn.filter(t => t.status === 'closed').length
            };

            // Pagination
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const total = filteredTickets.length;
            const totalPages = Math.ceil(total / limitNum);
            const startIndex = (pageNum - 1) * limitNum;
            const endIndex = startIndex + limitNum;
            const paginatedTickets = filteredTickets.slice(startIndex, endIndex);

            console.log(`[TICKETS] Returning ${paginatedTickets.length} tickets (${total} total, ${pendingTickets.length} pending)`);

            // Debug: Log sample of tickets
            if (paginatedTickets.length > 0) {
                console.log(`[TICKETS] Sample ticket:`, {
                    id: paginatedTickets[0].id,
                    title: paginatedTickets[0].title,
                    status: paginatedTickets[0].status,
                    assignedTo: paginatedTickets[0].assignedTo,
                    customerName: paginatedTickets[0].customerName
                });
            }

            res.json({
                success: true,
                data: {
                    tickets: paginatedTickets,
                    pendingTickets,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        totalPages
                    },
                    stats
                }
            });

        } catch (error) {
            console.error('[TICKETS] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch tickets',
                details: error.message
            });
        }
    }

    /**
     * Get a single ticket by ID
     */
    async getTicketById(req, res) {
        try {
            const { ticketId } = req.params;
            const { userId } = req.query;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId is required'
                });
            }

            const ticketDoc = await admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('tickets')
                .doc(ticketId)
                .get();

            if (!ticketDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'Ticket not found'
                });
            }

            const ticketData = ticketDoc.data();
            const userDoc = await admin.firestore().collection('users').doc(userId).get();
            const userData = userDoc.data();

            const ticket = {
                id: ticketDoc.id,
                userId,
                ...ticketData,
                customerName: ticketData.customerName || userData.displayName || userData.email?.split('@')[0],
                customerEmail: ticketData.customerEmail || userData.email,
                createdAt: ticketData.createdAt?.toDate?.()?.toISOString(),
                updatedAt: ticketData.updatedAt?.toDate?.()?.toISOString(),
                resolvedAt: ticketData.resolvedAt?.toDate?.()?.toISOString(),
                closedAt: ticketData.closedAt?.toDate?.()?.toISOString()
            };

            res.json({
                success: true,
                data: ticket
            });

        } catch (error) {
            console.error('[TICKETS] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch ticket',
                details: error.message
            });
        }
    }

    /**
     * Assign ticket to admin
     */
    async assignTicket(req, res) {
        try {
            const { ticketId } = req.params;
            const { userId, status = 'open' } = req.body;
            const adminEmail = req.user?.email || req.user?.displayName;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId is required'
                });
            }

            const ticketRef = admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('tickets')
                .doc(ticketId);

            await ticketRef.update({
                assignedTo: adminEmail,
                status,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`[TICKETS] Ticket ${ticketId} assigned to ${adminEmail}`);

            res.json({
                success: true,
                message: 'Ticket assigned successfully',
                data: {
                    ticketId,
                    assignedTo: adminEmail,
                    status
                }
            });

        } catch (error) {
            console.error('[TICKETS] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to assign ticket',
                details: error.message
            });
        }
    }

    /**
     * Update ticket
     */
    async updateTicket(req, res) {
        try {
            const { ticketId } = req.params;
            const { userId, status, priority, category, notes, resolution, assignedTo } = req.body;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId is required'
                });
            }

            const ticketRef = admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('tickets')
                .doc(ticketId);

            const updateData = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (status) updateData.status = status;
            if (priority) updateData.priority = priority;
            if (category) updateData.category = category;
            if (notes !== undefined) updateData.notes = notes;
            if (resolution !== undefined) updateData.resolution = resolution;
            if (assignedTo !== undefined) updateData.assignedTo = assignedTo;

            if (status === 'resolved') {
                updateData.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
            }

            if (status === 'closed') {
                updateData.closedAt = admin.firestore.FieldValue.serverTimestamp();
            }

            await ticketRef.update(updateData);

            console.log(`[TICKETS] Ticket ${ticketId} updated`);

            res.json({
                success: true,
                message: 'Ticket updated successfully',
                data: { ticketId, ...updateData }
            });

        } catch (error) {
            console.error('[TICKETS] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update ticket',
                details: error.message
            });
        }
    }

    /**
     * Add message to ticket
     */
    async addMessage(req, res) {
        try {
            const { ticketId } = req.params;
            const { userId, message, sender } = req.body;

            if (!userId || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'userId and message are required'
                });
            }

            const ticketRef = admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('tickets')
                .doc(ticketId);

            const ticketDoc = await ticketRef.get();
            if (!ticketDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'Ticket not found'
                });
            }

            const ticketData = ticketDoc.data();
            const messages = ticketData.messages || [];

            const newMessage = {
                id: messages.length + 1,
                sender: sender || req.user?.email || 'Admin',
                message,
                timestamp: new Date().toISOString(),
                isCustomer: false
            };

            messages.push(newMessage);

            await ticketRef.update({
                messages,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`[TICKETS] Message added to ticket ${ticketId}`);

            res.json({
                success: true,
                message: 'Message added successfully',
                data: newMessage
            });

        } catch (error) {
            console.error('[TICKETS] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add message',
                details: error.message
            });
        }
    }

    /**
     * Delete/resolve ticket
     */
    async deleteTicket(req, res) {
        try {
            const { ticketId } = req.params;
            const { userId } = req.query;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId is required'
                });
            }

            await admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('tickets')
                .doc(ticketId)
                .delete();

            console.log(`[TICKETS] Ticket ${ticketId} deleted`);

            res.json({
                success: true,
                message: 'Ticket deleted successfully'
            });

        } catch (error) {
            console.error('[TICKETS] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete ticket',
                details: error.message
            });
        }
    }
}

module.exports = new TicketController();
