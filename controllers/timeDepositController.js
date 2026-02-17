const { quoteTimeDeposit, createTimeDeposit } = require('../services/timeDepositService');
const { generateTimeDepositContract } = require('../services/contractService');
const { calculateCompletionDate } = require('../utils/timeDepositCalculator');

const getRequestId = (req) => {
    const headerValue = req.headers['x-request-id'];
    if (typeof headerValue === 'string' && headerValue.trim()) {
        return headerValue.trim();
    }
    return req.id;
};

class TimeDepositController {
    constructor() {
        this.quote = this.quote.bind(this);
        this.create = this.create.bind(this);
    }

    async quote(req, res) {
        try {
            const quote = await quoteTimeDeposit(req.body);

            return res.json({
                success: true,
                data: quote,
                requestId: req.id
            });
        } catch (error) {
            const status = error.status || 500;
            return res.status(status).json({
                success: false,
                error: error.message || 'Failed to quote time deposit',
                requestId: req.id
            });
        }
    }

    async create(req, res) {
        const requestId = getRequestId(req);

        try {
            const contractConfig = req.body.contract || {};
            const shouldGenerateContract = Boolean(contractConfig.enabled);
            const strictContract = contractConfig.strict !== false;

            let contractResult = null;
            let contractWarning;

            if (shouldGenerateContract) {
                try {
                    const completionDate = calculateCompletionDate(req.body.initialDate, req.body.term);
                    contractResult = await generateTimeDepositContract({
                        userId: req.params.id,
                        amount: req.body.amount,
                        term: req.body.term,
                        rate: req.body.finalInterestRate,
                        initialDate: req.body.initialDate,
                        completionDate: completionDate.toISOString().slice(0, 10),
                        requestId
                    });
                } catch (contractError) {
                    if (strictContract) {
                        throw contractError;
                    }
                    contractWarning = contractError.message || 'Contract generation failed';
                }
            }

            const result = await createTimeDeposit({
                targetUserId: req.params.id,
                payload: req.body,
                requestId,
                adminUser: req.admin,
                contractResult
            });

            return res.json({
                success: true,
                data: {
                    timeDeposit: result.timeDeposit,
                    idempotent: result.idempotent,
                    ...(contractResult ? { contract: contractResult } : {}),
                    ...(contractWarning ? { contractWarning } : {})
                },
                requestId: result.requestId || requestId
            });
        } catch (error) {
            const status = error.status || 500;
            return res.status(status).json({
                success: false,
                error: error.message || 'Failed to create time deposit',
                requestId
            });
        }
    }
}

module.exports = new TimeDepositController();