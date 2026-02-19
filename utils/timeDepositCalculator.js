const TAX_RATE = 0.2;

const TERM_TO_CYCLES = {
    sixMonths: 1,
    oneYear: 2,
    twoYears: 4
};

const TERM_TO_MONTHS = {
    sixMonths: 6,
    oneYear: 12,
    twoYears: 24
};

const roundTo = (value, decimals) => {
    if (!Number.isFinite(value)) return 0;
    return Number(value.toFixed(decimals));
};

const parseNumeric = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const cleaned = value.trim().replace(/,/g, '');
        if (!cleaned) return NaN;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    return NaN;
};

const normalizeTierTable = (rateTable = {}) => {
    const normalized = {};

    Object.entries(rateTable).forEach(([amountKey, rateValue]) => {
        const amount = parseNumeric(amountKey);
        const rate = parseNumeric(rateValue);

        if (!Number.isFinite(amount) || !Number.isFinite(rate) || amount < 0 || rate < 0) {
            return;
        }

        normalized[String(amount)] = rate;
    });

    return normalized;
};

const getSortedTierAmounts = (rateTable = {}) =>
    Object.keys(rateTable)
        .map((key) => parseNumeric(key))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);

const interpolateTierRate = (rateTable = {}, amountValue = 0) => {
    const amount = parseNumeric(amountValue);
    if (!Number.isFinite(amount) || amount < 0) {
        return 0;
    }

    const normalizedTable = normalizeTierTable(rateTable);
    const tierAmounts = getSortedTierAmounts(normalizedTable);

    if (!tierAmounts.length) {
        return 0;
    }

    if (amount <= tierAmounts[0]) {
        return roundTo(normalizedTable[String(tierAmounts[0])], 4);
    }

    const highestAmount = tierAmounts[tierAmounts.length - 1];
    if (amount >= highestAmount) {
        return roundTo(normalizedTable[String(highestAmount)], 4);
    }

    let lowTierAmount = tierAmounts[0];
    let highTierAmount = tierAmounts[1];

    for (let index = 0; index < tierAmounts.length - 1; index += 1) {
        const currentAmount = tierAmounts[index];
        const nextAmount = tierAmounts[index + 1];
        if (amount >= currentAmount && amount < nextAmount) {
            lowTierAmount = currentAmount;
            highTierAmount = nextAmount;
            break;
        }
    }

    const lowRate = normalizedTable[String(lowTierAmount)] ?? 0;
    const highRate = normalizedTable[String(highTierAmount)] ?? lowRate;

    if (highTierAmount === lowTierAmount) {
        return roundTo(lowRate, 4);
    }

    const interpolatedRate =
        lowRate +
        ((amount - lowTierAmount) / (highTierAmount - lowTierAmount)) *
            (highRate - lowRate);

    return roundTo(interpolatedRate, 4);
};

const getCyclesForTerm = (term) => TERM_TO_CYCLES[term] ?? 0;

const getMonthsForTerm = (term) => TERM_TO_MONTHS[term] ?? 0;

const calculateCompletionDate = (initialDateValue, term) => {
    const months = getMonthsForTerm(term);
    if (!months) {
        throw new Error('Unsupported term');
    }

    const initialDate = new Date(initialDateValue);
    if (Number.isNaN(initialDate.getTime())) {
        throw new Error('Invalid initial date');
    }

    const completionDate = new Date(initialDate);
    completionDate.setMonth(completionDate.getMonth() + months);

    return completionDate;
};

const calculateTermEarnings = ({ amount, finalInterestRate, term, taxRate = TAX_RATE }) => {
    const principal = parseNumeric(amount);
    const ratePercent = parseNumeric(finalInterestRate);
    const cycles = getCyclesForTerm(term);

    if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(ratePercent) || ratePercent < 0 || !cycles) {
        return {
            cycles,
            annualNetInterest: 0,
            totalNetInterestForTerm: 0,
            totalReturnAmount: 0
        };
    }

    // v1 rule: rate is applied per 6-month cycle, then 20% tax is removed from each cycle's gross interest.
    const grossInterestPerCycle = principal * (ratePercent / 100);
    const annualNetInterest = grossInterestPerCycle * (1 - taxRate);
    const totalNetInterestForTerm = annualNetInterest * cycles;
    const totalReturnAmount = principal + totalNetInterestForTerm;

    // v1 persistence/display rule: store quote outputs rounded to 2 decimals.
    return {
        cycles,
        annualNetInterest: roundTo(annualNetInterest, 2),
        totalNetInterestForTerm: roundTo(totalNetInterestForTerm, 2),
        totalReturnAmount: roundTo(totalReturnAmount, 2)
    };
};

const buildQuote = ({ amount, term, termRates, finalInterestRate, taxRate = TAX_RATE, agentRates = null, referral = null }) => {
    const estimatedInterestRate = interpolateTierRate(termRates, amount);
    const resolvedFinalRate = Number.isFinite(parseNumeric(finalInterestRate))
        ? parseNumeric(finalInterestRate)
        : estimatedInterestRate;

    const earnings = calculateTermEarnings({
        amount,
        finalInterestRate: resolvedFinalRate,
        term,
        taxRate
    });

    const estimatedAgentRate = agentRates ? interpolateTierRate(agentRates, amount) : undefined;

    let referralNetCommission;
    if (referral && Number.isFinite(parseNumeric(referral.commissionPercentage))) {
        const commissionPercentage = parseNumeric(referral.commissionPercentage);
        const principal = parseNumeric(amount);

        if (Number.isFinite(principal) && principal > 0 && commissionPercentage >= 0) {
            const grossCommission = principal * (commissionPercentage / 100);
            const commissionTax = grossCommission * taxRate;
            referralNetCommission = roundTo(grossCommission - commissionTax, 2);
        }
    }

    return {
        term,
        cycles: earnings.cycles,
        estimatedInterestRate,
        finalInterestRate: roundTo(resolvedFinalRate, 4),
        annualNetInterest: earnings.annualNetInterest,
        totalNetInterestForTerm: earnings.totalNetInterestForTerm,
        totalReturnAmount: earnings.totalReturnAmount,
        ...(estimatedAgentRate !== undefined ? { estimatedAgentRate } : {}),
        ...(referralNetCommission !== undefined ? { referralNetCommission } : {})
    };
};

module.exports = {
    TAX_RATE,
    TERM_TO_CYCLES,
    TERM_TO_MONTHS,
    roundTo,
    parseNumeric,
    normalizeTierTable,
    interpolateTierRate,
    getCyclesForTerm,
    getMonthsForTerm,
    calculateCompletionDate,
    calculateTermEarnings,
    buildQuote
};
