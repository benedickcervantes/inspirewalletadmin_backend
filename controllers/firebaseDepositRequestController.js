const firebaseDepositRequestService = require('../services/firebaseDepositRequestService');

class FirebaseDepositRequestController {
    constructor() {
        this.getDepositRequests = this.getDepositRequests.bind(this);
        this.getDepositRequestStats = this.getDepositRequestStats.bind(this);
    }

    async getDepositRequests(req, res) {
        try {
            const {
                page,
                limit,
                status,
                paymentMethod,
                search,
                dateFrom,
                dateTo,
                sortBy,
                sortOrder
            } = req.query;

            const result = await firebaseDepositRequestService.listDepositRequests({
                page,
                limit,
                status,
                paymentMethod,
                search,
                dateFrom,
                dateTo,
                sortBy,
                sortOrder
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Controller error fetching Firebase deposit requests:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch Firebase deposit requests'
            });
        }
    }

    async getDepositRequestStats(req, res) {
        try {
            const data = await firebaseDepositRequestService.getDepositRequestStats();
            res.json({
                success: true,
                data
            });
        } catch (error) {
            console.error('Controller error fetching Firebase deposit request stats:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch deposit request stats'
            });
        }
    }
}

module.exports = new FirebaseDepositRequestController();
