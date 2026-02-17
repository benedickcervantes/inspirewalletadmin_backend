const { getFirestore } = require('../config/firebase');
const { normalizeTierTable } = require('../utils/timeDepositCalculator');

const INVESTMENT_RATES_COLLECTION = 'investmentRates';
const DEFAULT_RATES_DOC_ID = process.env.INVESTMENT_RATES_DOC_ID || 'default';
const REQUIRED_TERMS = ['sixMonths', 'oneYear', 'twoYears'];

const normalizeRatesPayload = (payload = {}) => {
    const normalized = {
        sixMonths: normalizeTierTable(payload.sixMonths || {}),
        oneYear: normalizeTierTable(payload.oneYear || {}),
        twoYears: normalizeTierTable(payload.twoYears || {}),
        agentRates: normalizeTierTable(payload.agentRates || {})
    };

    return normalized;
};

const validateRequiredRates = (rates) => {
    const missingTerms = REQUIRED_TERMS.filter((term) => !Object.keys(rates[term] || {}).length);

    if (missingTerms.length) {
        throw new Error(`Missing investment rates for: ${missingTerms.join(', ')}`);
    }
};

const loadInvestmentRates = async (docId = DEFAULT_RATES_DOC_ID) => {
    const db = getFirestore();
    const ratesDocRef = db.collection(INVESTMENT_RATES_COLLECTION).doc(docId);
    const ratesDoc = await ratesDocRef.get();

    if (!ratesDoc.exists) {
        throw new Error('Investment rates configuration is missing');
    }

    const normalizedRates = normalizeRatesPayload(ratesDoc.data() || {});
    validateRequiredRates(normalizedRates);

    return normalizedRates;
};

const getRatesForTerm = (rates, term) => {
    if (!rates || typeof rates !== 'object') {
        throw new Error('Rates payload is invalid');
    }

    const termRates = rates[term];
    if (!termRates || !Object.keys(termRates).length) {
        throw new Error(`No rates configured for term: ${term}`);
    }

    return termRates;
};

module.exports = {
    INVESTMENT_RATES_COLLECTION,
    DEFAULT_RATES_DOC_ID,
    loadInvestmentRates,
    getRatesForTerm,
    normalizeRatesPayload
};