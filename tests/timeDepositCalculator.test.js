const test = require('node:test');
const assert = require('node:assert/strict');

const {
    interpolateTierRate,
    calculateTermEarnings,
    calculateCompletionDate,
    buildQuote
} = require('../utils/timeDepositCalculator');

test('interpolateTierRate returns min tier rate for amounts below the first tier', () => {
    const rate = interpolateTierRate({ 0: 2.5, 50000: 3.0, 100000: 3.5 }, -1);
    assert.equal(rate, 0);

    const validLow = interpolateTierRate({ 0: 2.5, 50000: 3.0, 100000: 3.5 }, 100);
    assert.equal(validLow, 2.501);
});

test('interpolateTierRate handles exact tier boundaries and top boundary', () => {
    const tiers = { 0: 2.5, 50000: 3.0, 100000: 3.5 };
    assert.equal(interpolateTierRate(tiers, 0), 2.5);
    assert.equal(interpolateTierRate(tiers, 50000), 3.0);
    assert.equal(interpolateTierRate(tiers, 100000), 3.5);
    assert.equal(interpolateTierRate(tiers, 150000), 3.5);
});

test('interpolateTierRate linearly interpolates and rounds to 4 decimals', () => {
    const tiers = { 50000: 3.0, 100000: 3.5 };
    assert.equal(interpolateTierRate(tiers, 75000), 3.25);

    const rounded = interpolateTierRate({ 0: 1.1111, 3: 1.1112 }, 2);
    assert.equal(rounded, 1.1112);
});

test('calculateTermEarnings follows v1 cycles and 20% tax for oneYear', () => {
    const result = calculateTermEarnings({ amount: 1000, finalInterestRate: 10, term: 'oneYear' });

    assert.equal(result.cycles, 2);
    assert.equal(result.annualNetInterest, 80);
    assert.equal(result.totalNetInterestForTerm, 160);
    assert.equal(result.totalReturnAmount, 1160);
});

test('calculateTermEarnings follows v1 cycles and 20% tax for twoYears', () => {
    const result = calculateTermEarnings({ amount: 5000, finalInterestRate: 5, term: 'twoYears' });

    assert.equal(result.cycles, 4);
    assert.equal(result.annualNetInterest, 200);
    assert.equal(result.totalNetInterestForTerm, 800);
    assert.equal(result.totalReturnAmount, 5800);
});

test('calculateTermEarnings returns zeroed values for invalid inputs', () => {
    const invalidAmount = calculateTermEarnings({ amount: 0, finalInterestRate: 5, term: 'sixMonths' });
    assert.deepEqual(invalidAmount, {
        cycles: 1,
        annualNetInterest: 0,
        totalNetInterestForTerm: 0,
        totalReturnAmount: 0
    });

    const invalidRate = calculateTermEarnings({ amount: 1000, finalInterestRate: -1, term: 'sixMonths' });
    assert.deepEqual(invalidRate, {
        cycles: 1,
        annualNetInterest: 0,
        totalNetInterestForTerm: 0,
        totalReturnAmount: 0
    });
});

test('buildQuote uses estimated rate as default final rate and calculates referral net commission', () => {
    const quote = buildQuote({
        amount: 75000,
        term: 'oneYear',
        termRates: { 0: 5, 50000: 6, 100000: 7 },
        referral: {
            commissionPercentage: 5
        },
        agentRates: { 0: 4, 100000: 6 }
    });

    assert.equal(quote.estimatedInterestRate, 6.5);
    assert.equal(quote.finalInterestRate, 6.5);
    assert.equal(quote.cycles, 2);
    assert.equal(quote.annualNetInterest, 3900);
    assert.equal(quote.totalNetInterestForTerm, 7800);
    assert.equal(quote.totalReturnAmount, 82800);
    assert.equal(quote.estimatedAgentRate, 5.5);
    assert.equal(quote.referralNetCommission, 3000);
});

test('calculateCompletionDate maps terms to expected maturities', () => {
    const start = '2026-02-17';

    const sixMonths = calculateCompletionDate(start, 'sixMonths');
    assert.equal(sixMonths.toISOString().slice(0, 10), '2026-08-17');

    const oneYear = calculateCompletionDate(start, 'oneYear');
    assert.equal(oneYear.toISOString().slice(0, 10), '2027-02-17');

    const twoYears = calculateCompletionDate(start, 'twoYears');
    assert.equal(twoYears.toISOString().slice(0, 10), '2028-02-17');
});
