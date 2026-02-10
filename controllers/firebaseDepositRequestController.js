const firebaseDepositRequestService = require('../services/firebaseDepositRequestService');

class FirebaseDepositRequestController {
    constructor() {
        this.getDepositRequests = this.getDepositRequests.bind(this);
    }

    async getDepositRequests(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                status = '',
                sortBy,
                sortOrder
            } = req.query;

            const result = await firebaseDepositRequestService.listDepositRequests({
                page,
                limit,
                status,
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
                error: 'Failed to fetch Firebase deposit requests'
            });
        }
    }
}

module.exports = new FirebaseDepositRequestController();
