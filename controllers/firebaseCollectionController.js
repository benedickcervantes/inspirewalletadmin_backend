const { getFirestore } = require('../config/firebase');
const User = require('../models/User');

const COLLECTION_CONFIG = {
    kycRequest: {
        defaultSortBy: 'submittedAt',
        userJoin: {
            localField: 'userId',
            foreignField: 'userId'
        }
    },
    taskWithdrawRequest: {
        defaultSortBy: 'createdAt',
        userJoin: {
            localField: 'userId',
            foreignField: 'userId'
        }
    }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class FirebaseCollectionController {
    constructor() {
        this.getCollection = this.getCollection.bind(this);
    }

    async getCollection(req, res) {
        try {
            const { collection } = req.params;
            const {
                page = 1,
                limit = 20,
                status = '',
                sortBy,
                sortOrder = 'desc',
                search = '',
                includeUser
            } = req.query;

            // Resolve collection name (strip prefix if present)
            const baseName = collection.startsWith('firebase_')
                ? collection.slice('firebase_'.length)
                : collection;
            const config = COLLECTION_CONFIG[baseName] || {};

            const db = getFirestore();
            const collectionRef = db.collection(baseName);

            // Build Firestore query with status filter
            let firestoreQuery = collectionRef;
            if (status) {
                firestoreQuery = firestoreQuery.where('status', '==', status);
            }

            // Fetch all matching documents
            const snapshot = await firestoreQuery.get();

            if (snapshot.empty) {
                return res.json({
                    success: true,
                    data: {
                        items: [],
                        pagination: {
                            total: 0,
                            page: Number.parseInt(page, 10) || 1,
                            limit: Number.parseInt(limit, 10) || 20,
                            totalPages: 0
                        }
                    }
                });
            }

            // Convert snapshots to plain objects
            let items = snapshot.docs.map(doc => {
                const data = doc.data();
                const converted = { _firebaseDocId: doc.id };
                for (const [key, value] of Object.entries(data)) {
                    if (value && typeof value.toDate === 'function') {
                        converted[key] = value.toDate();
                    } else {
                        converted[key] = value;
                    }
                }
                return converted;
            });

            // Apply search filter in memory
            if (search) {
                const safeSearch = escapeRegex(search);
                const searchRegex = new RegExp(safeSearch, 'i');
                items = items.filter(item =>
                    searchRegex.test(item.userName || '') ||
                    searchRegex.test(item.userEmail || '') ||
                    searchRegex.test(item.emailAddress || '') ||
                    searchRegex.test(item.userId || '') ||
                    searchRegex.test(item._firebaseDocId || '') ||
                    searchRegex.test(item.personalInfo?.firstName || '') ||
                    searchRegex.test(item.personalInfo?.lastName || '')
                );
            }

            // Join user data if needed
            const shouldJoinUser = includeUser === true || includeUser === 'true' || !!config.userJoin;
            if (shouldJoinUser) {
                // Collect unique userIds
                const localField = config.userJoin?.localField || 'userId';
                const userIds = [...new Set(items.map(item => item[localField]).filter(Boolean))];

                // Fetch users in batches (Firestore 'in' query supports max 30)
                const userMap = new Map();
                for (let i = 0; i < userIds.length; i += 30) {
                    const batch = userIds.slice(i, i + 30);
                    const foreignField = config.userJoin?.foreignField || 'userId';

                    // Fetch users by userId field
                    const usersSnapshot = await User.getCollection()
                        .where(foreignField, 'in', batch)
                        .get();

                    for (const userDoc of usersSnapshot.docs) {
                        const userData = userDoc.data();
                        const key = userData[foreignField];
                        userMap.set(key, {
                            userId: userData.userId,
                            firstName: userData.firstName,
                            lastName: userData.lastName,
                            emailAddress: userData.emailAddress,
                            accountNumber: userData.accountNumber
                        });
                    }
                }

                // Merge user data into items
                items = items.map(item => {
                    const userKey = item[localField];
                    const user = userMap.get(userKey) || null;
                    const { password, passcode, ...safeItem } = item;
                    return { ...safeItem, user };
                });
            }

            // Sort in memory
            const sortField = sortBy || config.defaultSortBy || 'createdAt';
            const sortDirection = sortOrder === 'asc' ? 1 : -1;
            items.sort((a, b) => {
                const aVal = a[sortField] ?? a._firebaseDocId;
                const bVal = b[sortField] ?? b._firebaseDocId;
                if (aVal === undefined && bVal === undefined) return 0;
                if (aVal === undefined) return 1;
                if (bVal === undefined) return -1;
                if (aVal > bVal) return sortDirection;
                if (aVal < bVal) return -sortDirection;
                return 0;
            });

            // Paginate
            const total = items.length;
            const pageValue = Number.parseInt(page, 10) || 1;
            const limitValue = Number.parseInt(limit, 10) || 20;
            const skip = (pageValue - 1) * limitValue;
            const pagedItems = items.slice(skip, skip + limitValue);

            res.json({
                success: true,
                data: {
                    items: pagedItems,
                    pagination: {
                        total,
                        page: pageValue,
                        limit: limitValue,
                        totalPages: Math.ceil(total / limitValue)
                    }
                }
            });
        } catch (error) {
            console.error('Controller error fetching firebase collection:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch collection'
            });
        }
    }
}

module.exports = new FirebaseCollectionController();
