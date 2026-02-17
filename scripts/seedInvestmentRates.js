require('dotenv').config();

const { initializeFirebase, getFirestore } = require('../config/firebase');

const DEFAULT_RATES = {
    sixMonths: {
        0: 2.5,
        50000: 3.0,
        100000: 3.5
    },
    oneYear: {
        0: 5.0,
        50000: 6.0,
        100000: 7.0
    },
    twoYears: {
        50000: 8.0,
        100000: 9.0
    },
    agentRates: {
        0: 5.0,
        50000: 6.0,
        100000: 7.0
    },
    updatedAt: new Date().toISOString(),
    source: 'seedInvestmentRates.js'
};

const run = async () => {
    initializeFirebase();

    const db = getFirestore();
    await db.collection('investmentRates').doc('default').set(DEFAULT_RATES, { merge: true });

    console.log('Seeded investmentRates/default with tier tables.');
};

run()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Failed to seed investment rates:', error);
        process.exit(1);
    });