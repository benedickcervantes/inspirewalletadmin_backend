const User = require('../models/User');

class SubcollectionController {
    constructor() {
        this.getBankApplications = this.getBankApplications.bind(this);
        this.getDepositRequests = this.getDepositRequests.bind(this);
        this.getMayaApplications = this.getMayaApplications.bind(this);
        this.getTravelApplications = this.getTravelApplications.bind(this);
        this.getWithdrawals = this.getWithdrawals.bind(this);
        this.getSubcollection = this.getSubcollection.bind(this);
    }

    /**
     * Generic method to get subcollection data with user info
     * Replaces MongoDB aggregation pipeline with Firestore fetch + in-memory processing
     */
    async getSubcollection(req, res, subcollectionName) {
        try {
            const {
                page = 1,
                limit = 20,
                status = '',
                sortBy = 'createdAt',
                sortOrder = 'desc'
            } = req.query;

            // Fetch all users from Firestore
            const allUsers = await User.findMany({});

            // Extract subcollection items with user info
            let items = [];
            for (const user of allUsers) {
                const subcollectionItems = user.subcollections?.[subcollectionName];
                if (!Array.isArray(subcollectionItems) || subcollectionItems.length === 0) continue;

                const userInfo = {
                    userId: user.userId || user.id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    emailAddress: user.emailAddress,
                    accountNumber: user.accountNumber
                };

                for (const item of subcollectionItems) {
                    items.push({
                        ...item,
                        user: userInfo
                    });
                }
            }

            // Apply status filter
            if (status) {
                items = items.filter(item => item.status === status);
            }

            // Sort in memory
            const sortDirection = sortOrder === 'asc' ? 1 : -1;
            items.sort((a, b) => {
                const aVal = a[sortBy];
                const bVal = b[sortBy];
                if (aVal === undefined && bVal === undefined) return 0;
                if (aVal === undefined) return 1;
                if (bVal === undefined) return -1;
                if (aVal > bVal) return sortDirection;
                if (aVal < bVal) return -sortDirection;
                return 0;
            });

            // Paginate
            const total = items.length;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const pagedItems = items.slice(skip, skip + parseInt(limit));

            res.json({
                success: true,
                data: {
                    items: pagedItems,
                    pagination: {
                        total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(total / parseInt(limit))
                    }
                }
            });
        } catch (error) {
            console.error(`Controller error fetching ${subcollectionName}:`, error);
            res.status(500).json({
                success: false,
                error: `Failed to fetch ${subcollectionName}`
            });
        }
    }

    async getBankApplications(req, res) {
        return this.getSubcollection(req, res, 'bankApplications');
    }

    async getDepositRequests(req, res) {
        return this.getSubcollection(req, res, 'depositRequests');
    }

    async getMayaApplications(req, res) {
        return this.getSubcollection(req, res, 'mayaApplications');
    }

    async getTravelApplications(req, res) {
        return this.getSubcollection(req, res, 'travelApplications');
    }

    async getWithdrawals(req, res) {
        try {
            const admin = require('firebase-admin');
            const { page = 1, limit = 20, status = '', sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;

            let items = [];

            console.log('[WITHDRAWALS] Fetching from both top-level and user subcollections...');
            
            // Fetch from top-level withdrawRequests collection (like v1)
            const topLevelRef = admin.firestore().collection('withdrawRequests');
            const topLevelSnapshot = await topLevelRef.get();
            console.log(`[WITHDRAWALS] Top-level withdrawRequests: ${topLevelSnapshot.size} documents`);

            topLevelSnapshot.docs.forEach(doc => {
                const data = doc.data();
                items.push({
                    _firebaseDocId: doc.id,
                    ...data,
                    withdrawalMethod: data.withdrawalMethod || '',
                    ewalletType: data.ewalletType || '',
                    ewalletAccountNumber: data.ewalletAccountNumber || data.walletNumber || '',
                    ewalletAccountName: data.ewalletAccountName || data.walletName || '',
                    submittedAt: data.submittedAt?.toDate?.()?.toISOString() || data.requestDate?.toDate?.()?.toISOString() || null,
                    processedAt: data.processedAt?.toDate?.()?.toISOString() || null,
                    approvedAt: data.approvedAt?.toDate?.()?.toISOString() || null,
                    createdAt: data.createdAt?.toDate?.()?.toISOString() || data.submittedAt?.toDate?.()?.toISOString() || null,
                    user: {
                        userId: data.userId,
                        firstName: data.userName?.split(' ')[0] || '',
                        lastName: data.userName?.split(' ').slice(1).join(' ') || '',
                        emailAddress: data.userEmail || data.emailAddress
                    },
                    source: 'top-level'
                });
            });

            // Fetch from user subcollections (like v1 does with collectionGroup)
            const groupQuery = admin.firestore().collectionGroup('withdrawals');
            const groupSnapshot = await groupQuery.get();
            console.log(`[WITHDRAWALS] User subcollection withdrawals: ${groupSnapshot.size} documents`);

            groupSnapshot.docs.forEach(doc => {
                const data = doc.data();
                items.push({
                    _firebaseDocId: doc.id,
                    ...data,
                    withdrawalMethod: data.withdrawalMethod || '',
                    ewalletType: data.ewalletType || '',
                    ewalletAccountNumber: data.ewalletAccountNumber || data.walletNumber || '',
                    ewalletAccountName: data.ewalletAccountName || data.walletName || '',
                    submittedAt: data.submittedAt?.toDate?.()?.toISOString() || data.requestDate?.toDate?.()?.toISOString() || null,
                    processedAt: data.processedAt?.toDate?.()?.toISOString() || null,
                    approvedAt: data.approvedAt?.toDate?.()?.toISOString() || null,
                    createdAt: data.createdAt?.toDate?.()?.toISOString() || data.submittedAt?.toDate?.()?.toISOString() || null,
                    user: {
                        userId: data.userId,
                        firstName: data.userName?.split(' ')[0] || '',
                        lastName: data.userName?.split(' ').slice(1).join(' ') || '',
                        emailAddress: data.userEmail || data.emailAddress
                    },
                    source: 'user-subcollection'
                });
            });

            console.log(`[WITHDRAWALS] Total items before filtering: ${items.length}`);

            // Apply status filter
            if (status) {
                items = items.filter(item => item.status?.toLowerCase() === status.toLowerCase());
                console.log(`[WITHDRAWALS] After status filter '${status}': ${items.length} items`);
            }

            // Sort
            const sortDirection = sortOrder === 'asc' ? 1 : -1;
            items.sort((a, b) => {
                const aVal = a[sortBy];
                const bVal = b[sortBy];
                if (!aVal && !bVal) return 0;
                if (!aVal) return 1;
                if (!bVal) return -1;
                if (aVal > bVal) return sortDirection;
                if (aVal < bVal) return -sortDirection;
                return 0;
            });

            // Paginate
            const total = items.length;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const pagedItems = items.slice(skip, skip + parseInt(limit));

            console.log(`[WITHDRAWALS] Returning ${pagedItems.length} of ${total} items (page ${page})`);

            res.json({
                success: true,
                data: {
                    items: pagedItems,
                    pagination: { 
                        total, 
                        page: parseInt(page), 
                        limit: parseInt(limit), 
                        totalPages: Math.ceil(total / parseInt(limit)) 
                    }
                }
            });
        } catch (error) {
            console.error('[WITHDRAWALS] Error fetching withdrawals:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch withdrawals' });
        }
    }
}

module.exports = new SubcollectionController();
