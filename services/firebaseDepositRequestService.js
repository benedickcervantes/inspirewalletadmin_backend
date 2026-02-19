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
    const nameSource = data.Name || data.name || data.userName || '';
    const { firstName: splitFirst, lastName: splitLast } = splitName(nameSource);
    const emailSource = data.emailAddress || data.userEmail || data.email;
    return {
        odId: userId,
        oderId: userId,
        firstName: data.firstName || splitFirst,
        lastName: data.lastName || splitLast,
        userName: data.userName,
        emailAddress: emailSource,
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

const parseDateMs = (iso) => {
    if (!iso || typeof iso !== 'string') return null;
    const ms = Date.parse(iso.trim());
    return Number.isNaN(ms) ? null : ms;
};

const applyFilters = (items, filters) => {
    const {
        status,
        paymentMethod,
        search,
        dateFrom,
        dateTo
    } = filters;

    return items.filter((item) => {
        if (status) {
            const s = (item.status || '').toLowerCase();
            if (s !== status.toLowerCase()) return false;
        }
        if (paymentMethod) {
            const pm = (item.paymentMethod || '').toLowerCase();
            if (pm !== paymentMethod.toLowerCase()) return false;
        }
        const createdMs = getTimestampMs(item.createdAt);
        if (dateFrom) {
            const fromMs = parseDateMs(dateFrom);
            if (fromMs !== null && (createdMs === null || createdMs < fromMs)) return false;
        }
        if (dateTo) {
            const toMs = parseDateMs(dateTo);
            if (toMs !== null && (createdMs === null || createdMs > toMs)) return false;
        }
        if (search) {
            const term = search.toLowerCase().trim();
            const email = (item.user?.emailAddress || '').toLowerCase();
            const fullName = [item.user?.firstName, item.user?.lastName].filter(Boolean).join(' ').toLowerCase();
            const ref = (item.referenceNumber || '').toLowerCase();
            const docId = (item._firebaseDocId || '').toLowerCase();
            const match = email.includes(term) || fullName.includes(term) || ref.includes(term) || docId.includes(term);
            if (!match) return false;
        }
        return true;
    });
};

const formatAmountWithSeparators = (num) => {
    if (num === null || num === undefined || Number.isNaN(num)) return '0';
    const n = Number(num);
    return Math.round(n).toLocaleString('en-US');
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
        const first = userDoc?.firstName ?? fallback.firstName;
        const last = userDoc?.lastName ?? fallback.lastName;
        const name = [first, last].filter(Boolean).join(' ') || userDoc?.userName || fallback.userName || '';
        const emailAddress = userDoc?.emailAddress ?? fallback.emailAddress;
        return {
            odId: userDoc?._id ?? fallback.odId ?? userId,
            oderId: userDoc?.userId ?? userDoc?._id ?? fallback.oderId ?? userId,
            firstName: first,
            lastName: last,
            name,
            emailAddress: emailAddress ?? undefined,
            accountNumber: userDoc?.accountNumber ?? fallback.accountNumber
        };
    }

    normalizeDeposit(doc, userDoc, userId) {
        const data = sanitizeFirestoreData(doc.data() || {});
        const normalizedUserId = resolveUserId(data, doc) || userId;
        const fallbackUser = buildUserFallback(data, normalizedUserId);
        const amountValue = parseNumber(data.amount);
        const paymentMethod = resolvePaymentMethod(data);
        const createdAt = resolveCreatedAt(data, doc);
        const user = this.buildUserPayload(userDoc, fallbackUser, normalizedUserId);

        return {
            _firebaseDocId: doc.id,
            userId: normalizedUserId,
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                emailAddress: user.emailAddress,
                odId: user.odId,
                accountNumber: user.accountNumber
            },
            amount: amountValue !== undefined ? amountValue : data.amount,
            status: data.status,
            paymentMethod,
            referenceNumber: resolveReferenceNumber(data, doc.id),
            createdAt,
            processedAt: resolveProcessedAt(data),
            notes: data.notes || data.note,
            type: data.type,
            maturityDate: toIsoString(data.maturityDate) ?? data.maturityDate,
            contractPeriod: data.contractPeriod,
            proofUrl: resolveProofUrl(data)
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
            status,
            paymentMethod,
            search,
            dateFrom,
            dateTo,
            sortBy = this.defaultSortBy,
            sortOrder = this.defaultSortOrder
        } = params;

        const pageValue = Number.parseInt(page, 10) || 1;
        const limitValue = Number.parseInt(limit, 10) || 20;
        const skip = (pageValue - 1) * limitValue;

        const db = getFirestore();
        const collectionGroup = this.getCollectionGroup(db);
        const snapshot = await collectionGroup.get();
        const allItems = await this.mapDeposits(snapshot.docs);
        const filters = { status, paymentMethod, search, dateFrom, dateTo };
        const filtered = applyFilters(allItems, filters);
        const total = filtered.length;
        const sorted = sortDeposits(filtered, sortBy, sortOrder);
        const items = sorted.slice(skip, skip + limitValue);

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

    async getDepositRequestStats() {
        const db = getFirestore();
        const collectionGroup = this.getCollectionGroup(db);
        const snapshot = await collectionGroup.get();
        const items = await this.mapDeposits(snapshot.docs);

        const total = items.length;
        const pending = items.filter((item) => (item.status || '').toLowerCase() === 'pending').length;
        const approved = items.filter((item) => (item.status || '').toLowerCase() === 'approved').length;
        const approvedOrCompleted = items.filter((item) => {
            const s = (item.status || '').toLowerCase();
            return s === 'approved' || s === 'completed';
        });
        const totalAmount = approvedOrCompleted.reduce((sum, item) => sum + (parseNumber(item.amount) || 0), 0);

        return {
            total,
            pending,
            approved,
            totalAmount: formatAmountWithSeparators(totalAmount)
        };
    }
}

module.exports = new FirebaseDepositRequestService();
