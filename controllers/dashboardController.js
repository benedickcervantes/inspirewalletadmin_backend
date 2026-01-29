const User = require('../models/User');
const logger = require('../utils/logger');

const buildTrend = (current, previous) => {
    const diff = current - previous;
    const percent = previous > 0 ? (diff / previous) * 100 : (current > 0 ? 100 : 0);
    return {
        current,
        previous,
        diff,
        percent
    };
};

class DashboardController {
    async getSummary(req, res) {
        try {
            // Fetch all users and compute in memory
            const allUsers = await User.findMany({});

            let totalUsers = 0;
            let totalTimeDeposits = 0;
            let totalAvailBalance = 0;

            const now = new Date();
            const currentStart = new Date(now);
            currentStart.setDate(currentStart.getDate() - 30);
            const previousStart = new Date(currentStart);
            previousStart.setDate(previousStart.getDate() - 30);

            let currentNewUsers = 0;
            let previousNewUsers = 0;
            let currentTimeDeposits = 0;
            let previousTimeDeposits = 0;
            let currentAvailBalance = 0;
            let previousAvailBalance = 0;

            for (const user of allUsers) {
                totalUsers++;
                totalTimeDeposits += user.timeDepositAmount || 0;
                totalAvailBalance += user.availBalanceAmount || 0;

                const createdAt = user.createdAt instanceof Date
                    ? user.createdAt
                    : (user.createdAt ? new Date(user.createdAt) : null);

                if (createdAt) {
                    if (createdAt >= currentStart) {
                        currentNewUsers++;
                        currentTimeDeposits += user.timeDepositAmount || 0;
                        currentAvailBalance += user.availBalanceAmount || 0;
                    } else if (createdAt >= previousStart && createdAt < currentStart) {
                        previousNewUsers++;
                        previousTimeDeposits += user.timeDepositAmount || 0;
                        previousAvailBalance += user.availBalanceAmount || 0;
                    }
                }
            }

            res.json({
                success: true,
                data: {
                    totals: {
                        users: totalUsers,
                        timeDeposits: totalTimeDeposits,
                        availableBalance: totalAvailBalance
                    },
                    trends: {
                        users: buildTrend(currentNewUsers, previousNewUsers),
                        timeDeposits: buildTrend(currentTimeDeposits, previousTimeDeposits),
                        availableBalance: buildTrend(currentAvailBalance, previousAvailBalance)
                    }
                }
            });
        } catch (error) {
            logger.error({ err: error }, 'Failed to load dashboard summary');
            res.status(500).json({
                success: false,
                error: 'Failed to fetch dashboard summary'
            });
        }
    }
}

module.exports = new DashboardController();
