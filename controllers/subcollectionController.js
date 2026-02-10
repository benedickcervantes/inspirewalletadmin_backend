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
        return this.getSubcollection(req, res, 'withdrawals');
    }
}

module.exports = new SubcollectionController();
