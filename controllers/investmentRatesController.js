const { getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

const INVESTMENT_RATES_COLLECTION = 'investmentRates';

class InvestmentRatesController {
    constructor() {
        this.getRates = this.getRates.bind(this);
        this.updateRates = this.updateRates.bind(this);
    }

    /**
     * GET /api/investment-rates/:docId
     * Fetches investment rate tiers from Firestore
     */
    async getRates(req, res) {
        try {
            const { docId } = req.params;

            if (!docId) {
                return res.status(400).json({
                    success: false,
                    error: 'Document ID is required'
                });
            }

            const db = getFirestore();
            const ratesDocRef = db.collection(INVESTMENT_RATES_COLLECTION).doc(docId);
            const ratesDoc = await ratesDocRef.get();

            if (!ratesDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'Investment rates document not found'
                });
            }

            const data = ratesDoc.data();

            logger.info({
                msg: 'Investment rates fetched',
                docId,
                userId: req.user?.uid,
                requestId: req.id
            });

            return res.json({
                success: true,
                data: {
                    docId,
                    ...data
                }
            });

        } catch (error) {
            logger.error({
                msg: 'Failed to fetch investment rates',
                error: error.message,
                stack: error.stack,
                requestId: req.id
            });

            return res.status(500).json({
                success: false,
                error: 'Failed to fetch investment rates'
            });
        }
    }

    /**
     * PUT /api/investment-rates/:docId
     * Updates investment rate tiers in Firestore
     * Admin only - affects all future deposits
     */
    async updateRates(req, res) {
        try {
            const { docId } = req.params;
            const { sixMonths, oneYear, twoYears, agentRates } = req.body;

            if (!docId) {
                return res.status(400).json({
                    success: false,
                    error: 'Document ID is required'
                });
            }

            // Validate at least one term is provided
            if (!sixMonths && !oneYear && !twoYears && !agentRates) {
                return res.status(400).json({
                    success: false,
                    error: 'At least one rate tier (sixMonths, oneYear, twoYears, or agentRates) must be provided'
                });
            }

            const db = getFirestore();
            const ratesDocRef = db.collection(INVESTMENT_RATES_COLLECTION).doc(docId);

            // Check if document exists
            const existingDoc = await ratesDocRef.get();
            if (!existingDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'Investment rates document not found'
                });
            }

            // Prepare update payload (only include provided terms)
            const updatePayload = {};
            if (sixMonths !== undefined) updatePayload.sixMonths = sixMonths;
            if (oneYear !== undefined) updatePayload.oneYear = oneYear;
            if (twoYears !== undefined) updatePayload.twoYears = twoYears;
            if (agentRates !== undefined) updatePayload.agentRates = agentRates;

            // Update Firestore
            await ratesDocRef.update(updatePayload);

            // Audit log
            logger.info({
                msg: 'Investment rates updated',
                docId,
                adminUid: req.admin?.uid,
                adminEmail: req.admin?.email,
                updatedTerms: Object.keys(updatePayload),
                requestId: req.id
            });

            return res.json({
                success: true,
                message: 'Investment rates updated successfully',
                data: {
                    docId,
                    updatedTerms: Object.keys(updatePayload)
                }
            });

        } catch (error) {
            logger.error({
                msg: 'Failed to update investment rates',
                error: error.message,
                stack: error.stack,
                adminUid: req.admin?.uid,
                requestId: req.id
            });

            return res.status(500).json({
                success: false,
                error: 'Failed to update investment rates'
            });
        }
    }
}

module.exports = new InvestmentRatesController();
