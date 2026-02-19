const crypto = require('crypto');
const { admin, getFirestore } = require('../config/firebase');
const hierarchyService = require('./hierarchyService');
const { loadInvestmentRates, getRatesForTerm } = require('./investmentRatesService');
const {
    TAX_RATE,
    parseNumeric,
    roundTo,
    buildQuote,
    calculateCompletionDate
} = require('../utils/timeDepositCalculator');

const USERS_COLLECTION = 'users';
const COUNTERS_COLLECTION = 'counters';
const COUNTER_DOC = 'investmentProfileId';
const ADMIN_COLLECTION = 'adminUsers';

const createHttpError = (status, message, code) => {
    const error = new Error(message);
    error.status = status;
    if (code) {
        error.code = code;
    }
    return error;
};

const asDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw createHttpError(400, 'Initial date is invalid', 'INVALID_INITIAL_DATE');
    }
    return date;
};

const formatDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }
    if (typeof value.toDate === 'function') {
        return value.toDate().toISOString().slice(0, 10);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed.toISOString().slice(0, 10);
};

const toTermLabel = (term) => {
    if (term === 'sixMonths') return '6 Months';
    if (term === 'oneYear') return '1 Year';
    if (term === 'twoYears') return '2 Years';
    return term;
};

const getUserByIdOrUserId = async (db, identifier, transaction = null) => {
    const normalizedId = typeof identifier === 'string' ? identifier.trim() : '';

    if (!normalizedId) {
        throw createHttpError(400, 'User identifier is required', 'USER_ID_REQUIRED');
    }

    const directRef = db.collection(USERS_COLLECTION).doc(normalizedId);
    const directDoc = transaction
        ? await transaction.get(directRef)
        : await directRef.get();

    if (directDoc.exists) {
        return { ref: directRef, snapshot: directDoc };
    }

    const query = db.collection(USERS_COLLECTION).where('userId', '==', normalizedId).limit(1);
    const querySnapshot = transaction
        ? await transaction.get(query)
        : await query.get();

    if (querySnapshot.empty) {
        throw createHttpError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const userDoc = querySnapshot.docs[0];
    return { ref: userDoc.ref, snapshot: userDoc };
};

const getCounterRef = (db) => db.collection(COUNTERS_COLLECTION).doc(COUNTER_DOC);

const nextDisplayId = async (db, transaction) => {
    const counterRef = getCounterRef(db);
    const counterDoc = await transaction.get(counterRef);

    const currentValue = counterDoc.exists
        ? Number(counterDoc.data().currentValue || 0)
        : 0;

    const nextValue = currentValue + 1;

    transaction.set(counterRef, { currentValue: nextValue }, { merge: true });
    return String(nextValue).padStart(7, '0');
};

const buildManualReferralDistribution = (referrerId, commissionPercentage) => [
    {
        userId: referrerId,
        name: 'Referrer',
        type: 'Manual Referrer',
        commissionPercentage: commissionPercentage,
        sharePercentage: 100
    }
];

const buildHierarchyDistribution = async (referrerAgentCode) => {
    const hierarchy = await hierarchyService.getAgentHierarchy(referrerAgentCode);
    const baseDistribution = hierarchy.commissionDistribution || [];

    if (!baseDistribution.length) {
        throw createHttpError(400, 'Hierarchy commission data is unavailable for selected referrer', 'HIERARCHY_NOT_FOUND');
    }

    return baseDistribution.map((member) => ({
        userId: member.userId,
        name: member.name,
        type: member.type,
        commissionPercentage: Number(member.commission) || 0,
        sharePercentage: Number(member.commission) || 0
    }));
};

const buildReferralContext = async ({ referral, quote, db, targetUserId }) => {
    if (!referral || !referral.referrerUserId) {
        return null;
    }

    const referrerLookup = await getUserByIdOrUserId(db, referral.referrerUserId);
    const referrerData = referrerLookup.snapshot.data() || {};

    const commissionPercentage = Number.isFinite(parseNumeric(referral.commissionPercentage))
        ? parseNumeric(referral.commissionPercentage)
        : (quote.estimatedAgentRate || 0);

    if (!Number.isFinite(commissionPercentage) || commissionPercentage < 0 || commissionPercentage > 100) {
        throw createHttpError(400, 'Referral commission percentage must be between 0 and 100', 'INVALID_COMMISSION_PERCENTAGE');
    }

    const principal = parseNumeric(quote.amount || 0);
    const grossCommission = roundTo(principal * (commissionPercentage / 100), 2);
    const taxAmount = roundTo(grossCommission * TAX_RATE, 2);
    const netCommission = roundTo(grossCommission - taxAmount, 2);

    if (netCommission < 0) {
        throw createHttpError(400, 'Referral net commission must be non-negative', 'INVALID_COMMISSION');
    }

    const mode = referral.mode === 'hierarchy' ? 'hierarchy' : 'manual';

    let distribution;
    if (mode === 'hierarchy') {
        if (!referrerData.agentCode) {
            throw createHttpError(400, 'Selected referrer is not mapped to an agent hierarchy', 'REFERRER_AGENT_CODE_MISSING');
        }
        distribution = await buildHierarchyDistribution(referrerData.agentCode);
    } else {
        distribution = buildManualReferralDistribution(referrerLookup.ref.id, commissionPercentage);
    }

    const distributed = distribution.map((member) => ({
        ...member,
        commissionAmount: roundTo(netCommission * ((Number(member.sharePercentage) || 0) / 100), 2),
        referredUserId: targetUserId
    }));

    return {
        mode,
        referrerDocId: referrerLookup.ref.id,
        referrerUserId: referrerData.userId || referrerLookup.ref.id,
        referrerDisplayName: `${referrerData.firstName || ''} ${referrerData.lastName || ''}`.trim() || referrerData.emailAddress || referrerLookup.ref.id,
        grossCommission,
        taxAmount,
        netCommission,
        commissionPercentage,
        distribution: distributed
    };
};

const normalizeCreatedRecord = ({ id, userId, doc }) => {
    const status = doc.status || doc.isActive || 'Active';

    return {
        id,
        displayId: doc.displayId,
        userId,
        amount: Number(doc.amount || 0),
        term: doc.contractType || doc.term,
        initialDate: formatDate(doc.initialDate),
        completionDate: formatDate(doc.completionDate),
        status,
        estimatedInterestRate: Number(doc.estimatedInterestRate || 0),
        finalInterestRate: Number(doc.rate ?? doc.finalInterestRate ?? 0),
        annualNetInterest: Number(doc.annualNetInterest || 0),
        totalNetInterestForTerm: Number(doc.totalNetInterestForTerm || 0),
        totalReturnAmount: Number(doc.totalReturnAmount || 0),
        estimatedAgentRate: doc.estimatedAgentRate !== undefined ? Number(doc.estimatedAgentRate) : undefined,
        agentRate: doc.agentRate !== undefined ? Number(doc.agentRate) : undefined,
        requestId: doc.requestId,
        contractId: doc.contractId
    };
};

const buildTransactionDescription = ({ amount, term, finalRate, annualNetInterest, totalNetInterestForTerm, estimatedAgentRate }) => {
    const formattedAmount = Number(amount || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP'
    });

    const formatPeso = (value) => Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP'
    });

    return `Added ${formattedAmount} to Time Deposit for ${toTermLabel(term)} at ${Number(finalRate || 0)}% interest (Agent Rate: ${Number(estimatedAgentRate || 0)}%). Annual Net Gain: ${formatPeso(annualNetInterest)}. Total Net Gain (Term): ${formatPeso(totalNetInterestForTerm)}.`;
};

const quoteTimeDeposit = async (payload) => {
    const amount = parseNumeric(payload.amount);

    if (!Number.isFinite(amount) || amount < 0) {
        throw createHttpError(400, 'Amount must be a valid non-negative number', 'INVALID_AMOUNT');
    }

    const rates = await loadInvestmentRates();
    const termRates = getRatesForTerm(rates, payload.term);

    return buildQuote({
        amount,
        term: payload.term,
        termRates,
        finalInterestRate: payload.finalInterestRate,
        agentRates: Object.keys(rates.agentRates || {}).length ? rates.agentRates : null,
        referral: payload.referral
    });
};

const createTimeDeposit = async ({
    targetUserId,
    payload,
    requestId,
    adminUser,
    contractResult
}) => {
    const db = getFirestore();
    const amount = parseNumeric(payload.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
        throw createHttpError(400, 'Amount must be greater than zero', 'INVALID_AMOUNT');
    }

    const rates = await loadInvestmentRates();
    const termRates = getRatesForTerm(rates, payload.term);
    const quote = buildQuote({
        amount,
        term: payload.term,
        termRates,
        finalInterestRate: payload.finalInterestRate,
        agentRates: Object.keys(rates.agentRates || {}).length ? rates.agentRates : null,
        referral: payload.referral
    });

    const initialDate = asDate(payload.initialDate);
    const completionDate = calculateCompletionDate(initialDate, payload.term);

    const refContext = await buildReferralContext({
        referral: payload.referral,
        quote: {
            ...quote,
            amount
        },
        db,
        targetUserId
    });

    const idempotencyKey = (requestId && requestId.trim()) || crypto.randomUUID();

    const result = await db.runTransaction(async (transaction) => {
        const userLookup = await getUserByIdOrUserId(db, targetUserId, transaction);
        const userRef = userLookup.ref;
        const userData = userLookup.snapshot.data() || {};

        const timeDepositRef = userRef.collection('inspireAuto').doc(idempotencyKey);
        const existingDoc = await transaction.get(timeDepositRef);

        if (existingDoc.exists) {
            return {
                timeDeposit: normalizeCreatedRecord({
                    id: existingDoc.id,
                    userId: userRef.id,
                    doc: existingDoc.data() || {}
                }),
                idempotent: true
            };
        }

        const displayId = await nextDisplayId(db, transaction);
        const timeDepositAmount = Number(userData.timeDepositAmount || 0);

        transaction.update(userRef, {
            timeDepositAmount: roundTo(timeDepositAmount + amount, 2)
        });

        if (refContext) {
            for (const member of refContext.distribution) {
                const memberLookup = await getUserByIdOrUserId(db, member.userId, transaction);
                const memberData = memberLookup.snapshot.data() || {};
                const currentWallet = Number(memberData.agentWalletAmount || 0);
                const commissionAmount = Number(member.commissionAmount || 0);

                transaction.update(memberLookup.ref, {
                    agentWalletAmount: roundTo(currentWallet + commissionAmount, 2)
                });

                const agentTransactionRef = memberLookup.ref.collection('agentTransactions').doc();
                transaction.set(agentTransactionRef, {
                    amount: commissionAmount,
                    date: admin.firestore.FieldValue.serverTimestamp(),
                    type: refContext.mode === 'hierarchy'
                        ? `Hierarchy Commission (${Number(member.commissionPercentage || 0)}%, Net After Tax) - Time Deposit`
                        : `Referral Bonus (${Number(refContext.commissionPercentage)}%, Net After Tax) - Time Deposit`,
                    grossAmount: refContext.mode === 'hierarchy' ? commissionAmount : refContext.grossCommission,
                    taxApplied: refContext.mode === 'hierarchy' ? 0 : refContext.taxAmount,
                    percentage: Number(member.commissionPercentage || refContext.commissionPercentage),
                    referredUserId: userRef.id,
                    referredClient: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.emailAddress || userRef.id,
                    investmentAmount: amount,
                    displayId,
                    selectedReferrerId: refContext.referrerDocId,
                    agentType: member.type || undefined,
                    mode: refContext.mode
                });
            }
        }

        const timeDepositDoc = {
            requestId: idempotencyKey,
            displayId,
            amount,
            initialDate: admin.firestore.Timestamp.fromDate(initialDate),
            completionDate: admin.firestore.Timestamp.fromDate(completionDate),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            isActive: 'Active',
            status: 'Active',
            contractType: payload.term,
            estimatedInterestRate: quote.estimatedInterestRate,
            rate: quote.finalInterestRate,
            estimatedAgentRate: quote.estimatedAgentRate || 0,
            agentRate: refContext ? Number(refContext.commissionPercentage) : (quote.estimatedAgentRate || 0),
            annualNetInterest: quote.annualNetInterest,
            totalNetInterestForTerm: quote.totalNetInterestForTerm,
            totalReturnAmount: quote.totalReturnAmount,
            currentCycleCount: 0,
            ...(refContext ? { referrerId: refContext.referrerDocId } : {}),
            ...(contractResult ? { contractId: contractResult.contractId } : {})
        };

        transaction.set(timeDepositRef, timeDepositDoc);

        const txRef = userRef.collection('transactions').doc();
        transaction.set(txRef, {
            displayId,
            amount,
            type: 'Add Time Deposit',
            description: buildTransactionDescription({
                amount,
                term: payload.term,
                finalRate: quote.finalInterestRate,
                annualNetInterest: quote.annualNetInterest,
                totalNetInterestForTerm: quote.totalNetInterestForTerm,
                estimatedAgentRate: quote.estimatedAgentRate || 0
            }),
            date: admin.firestore.FieldValue.serverTimestamp(),
            contractType: payload.term,
            estimatedInterestRate: quote.estimatedInterestRate,
            rate: quote.finalInterestRate,
            estimatedAgentRate: quote.estimatedAgentRate || 0,
            agentRate: refContext ? Number(refContext.commissionPercentage) : (quote.estimatedAgentRate || 0),
            annualNetInterest: quote.annualNetInterest,
            totalNetInterestForTerm: quote.totalNetInterestForTerm,
            totalReturnAmount: quote.totalReturnAmount,
            ...(refContext ? { referrerId: refContext.referrerDocId } : {})
        });

        const adminId = adminUser && adminUser.id ? adminUser.id : null;
        if (adminId) {
            const adminLogRef = db
                .collection(ADMIN_COLLECTION)
                .doc(adminId)
                .collection('admin_history_logs')
                .doc();

            const targetUserName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.emailAddress || userRef.id;
            const actorName = adminUser.displayName || adminUser.email || adminId;

            let details = `Admin ${actorName} added a ${Number(amount).toLocaleString('en-PH', {
                style: 'currency',
                currency: 'PHP'
            })} time deposit (${toTermLabel(payload.term)}, ${quote.finalInterestRate}%) for user ${targetUserName} (ID: ${userData.userId || userRef.id}). Investment Profile ID: ${displayId}.`;

            if (contractResult && contractResult.contractId) {
                details += ` Contract ID: ${contractResult.contractId}.`;
            }

            if (refContext) {
                if (refContext.mode === 'hierarchy') {
                    details += ` Hierarchy commissions processed for ${refContext.referrerDisplayName}: ${refContext.distribution.length} members.`;
                } else {
                    details += ` Manual referral commission processed for ${refContext.referrerDisplayName}.`;
                }
            }

            transaction.set(adminLogRef, {
                action: 'Add Time Deposit',
                adminUid: adminId,
                adminEmail: adminUser.email || '',
                adminDisplayName: actorName,
                adminName: actorName,
                targetUserId: userData.userId || userRef.id,
                targetUserName,
                amount,
                term: payload.term,
                rate: quote.finalInterestRate,
                displayId,
                resourceType: 'DEPOSIT',
                resourceId: displayId,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                details,
                ...(refContext ? {
                    manualReferralUsed: refContext.mode === 'manual',
                    referrerId: refContext.referrerDocId,
                    hierarchyCommissionsUsed: refContext.mode === 'hierarchy',
                    hierarchyMembers: refContext.mode === 'hierarchy' ? refContext.distribution.length : 0
                } : {})
            });
        }

        if (contractResult && contractResult.contractId) {
            const contractLinkRef = userRef.collection('contractLinks').doc(contractResult.contractId);
            transaction.set(contractLinkRef, {
                contractId: contractResult.contractId,
                investmentAmount: amount,
                interestRate: quote.finalInterestRate,
                contractDate: admin.firestore.FieldValue.serverTimestamp(),
                completionDate: admin.firestore.Timestamp.fromDate(completionDate),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                viewUrl: contractResult.urls?.view,
                downloadUrl: contractResult.urls?.download,
                pdfUrl: contractResult.urls?.pdf,
                expiresAt: contractResult.expiresAt || null,
                status: 'Active',
                term: payload.term,
                displayId,
                requestId: idempotencyKey
            });
        }

        return {
            timeDeposit: normalizeCreatedRecord({
                id: idempotencyKey,
                userId: userData.userId || userRef.id,
                doc: timeDepositDoc
            }),
            idempotent: false
        };
    });

    return {
        ...result,
        requestId: idempotencyKey
    };
};

module.exports = {
    quoteTimeDeposit,
    createTimeDeposit,
    createHttpError
};
