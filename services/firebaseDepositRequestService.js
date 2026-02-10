const { getFirestore } = require('../config/firebase');
const { getTimestampMs, sanitizeFirestoreData } = require('../utils/firestoreUtils');

const COLLECTION_GROUP = 'depositRequest';
const USERS_COLLECTION = 'users';
const DEFAULT_SORT_BY = 'date';
const DEFAULT_SORT_ORDER = 'desc';

const parseNumber = (value) => {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const parsed = Number(trimmed.replace(/,/g, ''));
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
};

const toIsoString = (value) => {
    const timestamp = getTimestampMs(value);
    if (timestamp === null) return undefined;
    return new Date(timestamp).toISOString();
};

const buildDateTimeIso = (dateValue, timeValue) => {
    if (!dateValue || typeof dateValue !== 'string') return undefined;
    const dateText = dateValue.trim();
    if (!dateText) return undefined;
    const timeText = typeof timeValue === 'string' && timeValue.trim()
        ? timeValue.trim()
        : '';
    const combined = timeText ? `${dateText}T${timeText}` : dateText;
    const parsed = Date.parse(combined);
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
};

const resolveCreatedAt = (data, doc) => {
    const direct = toIsoString(data.createdAt) || toIsoString(data.timestamp) || toIsoString(data.created_at);
    if (direct) return direct;
    const combined = buildDateTimeIso(data.date, data.time);
    if (combined) return combined;
    if (doc?.createTime?.toDate) {
        return doc.createTime.toDate().toISOString();
    }
    return undefined;
};

const resolveProcessedAt = (data) =>
    toIsoString(data.processedAt) ||
    toIsoString(data.approvedAt) ||
    toIsoString(data.completedAt) ||
    toIsoString(data.updatedAt);

const resolveReferenceNumber = (data, docId) =>
    data.referenceNumber ||
    data.controlNumber ||
    data.depositId ||
    docId;

const resolvePaymentMethod = (data) =>
    data.paymentMethod ||
    data.depositType ||
    data.payment_method ||
    data.paymentType;

const resolveProofUrl = (data) =>
    data.proofUrl ||
    data.receiptUrl ||
    data.receiptURL ||
    data.receipt;

const resolveUserId = (data, doc) =>
    data.userId ||
    doc?.ref?.parent?.parent?.id ||
    data.user_id ||
    undefined;

const splitName = (name) => {
    if (typeof name !== 'string') return { firstName: undefined, lastName: undefined };
    const trimmed = name.trim();
    if (!trimmed) return { firstName: undefined, lastName: undefined };
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: undefined };
    }
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

const buildUserFallback = (data, userId) => {
    const { firstName: splitFirst, lastName: splitLast } = splitName(data.Name || data.name);
    return {
        odId: userId,
        oderId: userId,
        firstName: data.firstName || splitFirst,
        lastName: data.lastName || splitLast,
        emailAddress: data.emailAddress,
        accountNumber: data.accountNumber
    };
};

const getSortableValue = (item, field) => {
    const value = item[field];
    if (field === 'date' || field === 'createdAt' || field === 'processedAt' || field === 'updatedAt') {
        return getTimestampMs(value) ?? 0;
    }
    const numeric = parseNumber(value);
    if (numeric !== undefined) return numeric;
    if (typeof value === 'string') {
        return value.toLowerCase();
    }
    return value ?? null;
};

const sortDeposits = (items, sortBy, sortOrder) => {
    const direction = sortOrder === 'asc' ? 1 : -1;
    const field = sortBy || DEFAULT_SORT_BY;

    return [...items].sort((a, b) => {
        const aValue = getSortableValue(a, field);
        const bValue = getSortableValue(b, field);

        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;

        if (typeof aValue === 'number' && typeof bValue === 'number') {
            return direction * (aValue - bValue);
        }

        return direction * String(aValue).localeCompare(String(bValue));
    });
};

class FirebaseDepositRequestService {
    constructor() {
        this.collectionGroupName = COLLECTION_GROUP;
        this.usersCollection = USERS_COLLECTION;
        this.defaultSortBy = DEFAULT_SORT_BY;
        this.defaultSortOrder = DEFAULT_SORT_ORDER;
    }

    getCollectionGroup(db) {
        return db.collectionGroup(this.collectionGroupName);
    }

    async getUserById(db, userId, cache) {
        if (!userId) return null;
        if (cache.has(userId)) return cache.get(userId);

        const snapshot = await db.collection(this.usersCollection).doc(userId).get();
        if (!snapshot.exists) {
            cache.set(userId, null);
            return null;
        }

        const userData = sanitizeFirestoreData(snapshot.data() || {});
        const normalized = {
            _id: snapshot.id,
            ...userData
        };
        cache.set(userId, normalized);
        return normalized;
    }

    buildUserPayload(userDoc, fallback, userId) {
        if (userDoc) {
            return {
                odId: userDoc._id,
                oderId: userDoc.userId || userDoc._id,
                firstName: userDoc.firstName || fallback.firstName,
                lastName: userDoc.lastName || fallback.lastName,
                emailAddress: userDoc.emailAddress || fallback.emailAddress,
                accountNumber: userDoc.accountNumber || fallback.accountNumber
            };
        }

        return {
            odId: fallback.odId || userId,
            oderId: fallback.oderId || userId,
            firstName: fallback.firstName,
            lastName: fallback.lastName,
            emailAddress: fallback.emailAddress,
            accountNumber: fallback.accountNumber
        };
    }

    normalizeDeposit(doc, userDoc, userId) {
        const data = sanitizeFirestoreData(doc.data() || {});
        const normalizedUserId = resolveUserId(data, doc) || userId;
        const fallbackUser = buildUserFallback(data, normalizedUserId);
        const amountValue = parseNumber(data.amount);

        return {
            ...data,
            _firebaseDocId: doc.id,
            userId: normalizedUserId,
            referenceNumber: resolveReferenceNumber(data, doc.id),
            paymentMethod: resolvePaymentMethod(data),
            createdAt: resolveCreatedAt(data, doc),
            processedAt: resolveProcessedAt(data),
            notes: data.notes || data.note,
            proofUrl: resolveProofUrl(data),
            amount: amountValue !== undefined ? amountValue : data.amount,
            user: this.buildUserPayload(userDoc, fallbackUser, normalizedUserId)
        };
    }

    async mapDeposits(docs) {
        const db = getFirestore();
        const cache = new Map();

        const userIds = docs.map((doc) => resolveUserId(doc.data() || {}, doc)).filter(Boolean);
        const uniqueUserIds = Array.from(new Set(userIds));

        await Promise.all(
            uniqueUserIds.map(async (id) => {
                await this.getUserById(db, id, cache);
            })
        );

        return Promise.all(
            docs.map(async (doc) => {
                const userId = resolveUserId(doc.data() || {}, doc);
                const userDoc = await this.getUserById(db, userId, cache);
                return this.normalizeDeposit(doc, userDoc, userId);
            })
        );
    }

    async getTotalCount(queryRef) {
        if (typeof queryRef.count === 'function') {
            try {
                const countSnapshot = await queryRef.count().get();
                const data = countSnapshot.data();
                if (data && typeof data.count === 'number') {
                    return data.count;
                }
            } catch (error) {
                console.warn('Firebase count aggregation failed, falling back to full scan:', error.message);
            }
        }

        const snapshot = await queryRef.get();
        return snapshot.size;
    }

    async listDepositRequests(params = {}) {
        const {
            page = 1,
            limit = 20,
            status = '',
            sortBy = this.defaultSortBy,
            sortOrder = this.defaultSortOrder
        } = params;

        const pageValue = Number.parseInt(page, 10) || 1;
        const limitValue = Number.parseInt(limit, 10) || 20;
        const skip = (pageValue - 1) * limitValue;

        const db = getFirestore();
        const collectionGroup = this.getCollectionGroup(db);
        const hasFilter = Boolean(status);

        if (hasFilter) {
            const snapshot = await collectionGroup.get();
            const items = await this.mapDeposits(snapshot.docs);
            const filtered = status
                ? items.filter((item) => (item.status || '').toLowerCase() === status.toLowerCase())
                : items;
            const sorted = sortDeposits(filtered, sortBy, sortOrder);
            const paged = sorted.slice(skip, skip + limitValue);
            const total = filtered.length;

            return {
                items: paged,
                pagination: {
                    total,
                    page: pageValue,
                    limit: limitValue,
                    totalPages: Math.ceil(total / limitValue) || 1
                }
            };
        }

        let query = collectionGroup.orderBy(sortBy, sortOrder === 'asc' ? 'asc' : 'desc');
        if (skip > 0) {
            query = query.offset(skip);
        }

        let snapshot;
        let total;
        try {
            total = await this.getTotalCount(collectionGroup);
            snapshot = await query.limit(limitValue).get();
        } catch (error) {
            console.warn('Firebase deposit request query failed, falling back to in-memory sort:', error.message);
            const allSnapshot = await collectionGroup.get();
            const items = await this.mapDeposits(allSnapshot.docs);
            const sorted = sortDeposits(items, sortBy, sortOrder);
            const paged = sorted.slice(skip, skip + limitValue);
            total = items.length;

            return {
                items: paged,
                pagination: {
                    total,
                    page: pageValue,
                    limit: limitValue,
                    totalPages: Math.ceil(total / limitValue) || 1
                }
            };
        }

        const items = await this.mapDeposits(snapshot.docs);

        return {
            items,
            pagination: {
                total,
                page: pageValue,
                limit: limitValue,
                totalPages: Math.ceil(total / limitValue) || 1
            }
        };
    }
}

module.exports = new FirebaseDepositRequestService();
