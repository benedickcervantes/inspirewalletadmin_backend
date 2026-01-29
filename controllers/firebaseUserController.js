const { getFirestore } = require('../config/firebase');
const { getTimestampMs, sanitizeFirestoreData } = require('../utils/firestoreUtils');

const USERS_COLLECTION = 'users';
const DEFAULT_SORT_BY = 'createdAt';

const normalizeUserDoc = (doc) => {
    const data = sanitizeFirestoreData(doc.data() || {});
    const userId = typeof data.userId === 'string' && data.userId.trim()
        ? data.userId.trim()
        : doc.id;

    return {
        ...data,
        _id: doc.id,
        userId
    };
};

const normalizeSubcollectionDoc = (doc) => {
    const data = sanitizeFirestoreData(doc.data() || {});
    return {
        ...data,
        _firebaseDocId: doc.id
    };
};

const getSortableValue = (user, field) => {
    const value = user[field];
    if (field === 'createdAt' || field === 'lastLogin' || field === 'lastSignedIn') {
        return getTimestampMs(value) ?? 0;
    }
    if (typeof value === 'number') {
        return Number.isNaN(value) ? 0 : value;
    }
    if (typeof value === 'string') {
        return value.toLowerCase();
    }
    return value ?? null;
};

const sortUsers = (users, sortBy, sortOrder) => {
    const direction = sortOrder === 'asc' ? 1 : -1;
    const field = sortBy || DEFAULT_SORT_BY;

    return [...users].sort((a, b) => {
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

const matchesSearch = (user, searchTerm) => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return true;
    const values = [
        user.firstName,
        user.lastName,
        user.emailAddress,
        user.accountNumber,
        user.agentNumber,
        user.agentCode,
        user.userId,
        user._id,
        user.userName,
        user.displayName
    ]
        .filter((value) => typeof value === 'string' && value.trim().length > 0)
        .join(' ')
        .toLowerCase();

    return values.includes(normalized);
};

const applyFilters = (users, { search, status, kycStatus, agent }) => {
    let filtered = users;

    if (status) {
        const normalizedStatus = status.toLowerCase();
        filtered = filtered.filter((user) => (user.status || '').toLowerCase() === normalizedStatus);
    }

    if (kycStatus) {
        const normalizedKyc = kycStatus.toLowerCase();
        filtered = filtered.filter((user) => (user.kycStatus || '').toLowerCase() === normalizedKyc);
    }

    if (typeof agent === 'boolean') {
        filtered = filtered.filter((user) => Boolean(user.agent) === agent);
    }

    if (search) {
        filtered = filtered.filter((user) => matchesSearch(user, search));
    }

    return filtered;
};

const fetchSubcollections = async (userRef) => {
    const collections = await userRef.listCollections();
    if (!collections.length) {
        return undefined;
    }

    const entries = await Promise.all(collections.map(async (collectionRef) => {
        const snapshot = await collectionRef.get();
        if (snapshot.empty) {
            return null;
        }
        const items = snapshot.docs.map(normalizeSubcollectionDoc);
        return [collectionRef.id, items];
    }));

    const subcollections = {};
    entries.forEach((entry) => {
        if (!entry) return;
        const [name, items] = entry;
        subcollections[name] = items;
    });

    return Object.keys(subcollections).length > 0 ? subcollections : undefined;
};

const getTotalCount = async (collectionRef) => {
    if (typeof collectionRef.count === 'function') {
        try {
            const countSnapshot = await collectionRef.count().get();
            const data = countSnapshot.data();
            if (data && typeof data.count === 'number') {
                return data.count;
            }
        } catch (error) {
            console.warn('Firebase count aggregation failed, falling back to full scan:', error.message);
        }
    }

    const snapshot = await collectionRef.get();
    return snapshot.size;
};

class FirebaseUserController {
    constructor() {
        this.getAllUsers = this.getAllUsers.bind(this);
        this.getUserById = this.getUserById.bind(this);
    }

    async getAllUsers(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                search = '',
                status = '',
                kycStatus = '',
                agent,
                sortBy = DEFAULT_SORT_BY,
                sortOrder = 'desc'
            } = req.query;

            const db = getFirestore();
            const collectionRef = db.collection(USERS_COLLECTION);

            const pageValue = Number.parseInt(page, 10) || 1;
            const limitValue = Number.parseInt(limit, 10) || 20;
            const skip = (pageValue - 1) * limitValue;
            const hasFilters = Boolean(search || status || kycStatus || typeof agent === 'boolean');

            if (hasFilters) {
                const snapshot = await collectionRef.get();
                const users = snapshot.docs.map(normalizeUserDoc);
                const filteredUsers = applyFilters(users, { search, status, kycStatus, agent });
                const sortedUsers = sortUsers(filteredUsers, sortBy, sortOrder);
                const pagedUsers = sortedUsers.slice(skip, skip + limitValue);
                const total = filteredUsers.length;

                return res.json({
                    success: true,
                    data: {
                        users: pagedUsers,
                        pagination: {
                            total,
                            page: pageValue,
                            limit: limitValue,
                            totalPages: Math.ceil(total / limitValue) || 1
                        }
                    }
                });
            }

            const total = await getTotalCount(collectionRef);
            const direction = sortOrder === 'asc' ? 'asc' : 'desc';
            let query = collectionRef.orderBy(sortBy || DEFAULT_SORT_BY, direction);

            if (skip > 0) {
                query = query.offset(skip);
            }

            const snapshot = await query.limit(limitValue).get();
            const users = snapshot.docs.map(normalizeUserDoc);

            res.json({
                success: true,
                data: {
                    users,
                    pagination: {
                        total,
                        page: pageValue,
                        limit: limitValue,
                        totalPages: Math.ceil(total / limitValue) || 1
                    }
                }
            });
        } catch (error) {
            console.error('Controller error fetching Firebase users:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch Firebase users'
            });
        }
    }

    async getUserById(req, res) {
        try {
            const { id } = req.params;
            const db = getFirestore();
            const collectionRef = db.collection(USERS_COLLECTION);

            let userDoc = await collectionRef.doc(id).get();

            if (!userDoc.exists) {
                const querySnapshot = await collectionRef.where('userId', '==', id).limit(1).get();
                if (!querySnapshot.empty) {
                    userDoc = querySnapshot.docs[0];
                }
            }

            if (!userDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const user = normalizeUserDoc(userDoc);
            const subcollections = await fetchSubcollections(userDoc.ref);
            if (subcollections) {
                user.subcollections = subcollections;
            }

            res.json({
                success: true,
                data: user
            });
        } catch (error) {
            console.error('Controller error fetching Firebase user by ID:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch Firebase user'
            });
        }
    }
}

module.exports = new FirebaseUserController();
