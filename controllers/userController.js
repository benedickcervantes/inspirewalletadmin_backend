const User = require('../models/User');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSafeUser = (user) => {
    const hasPassword = Boolean(user.password);
    const isFirebaseUser = Boolean(user.migratedFromFirebase || user.migrationDate);
    const migrationStatus = isFirebaseUser
        ? (hasPassword ? 'password_set' : 'password_needed')
        : 'not_firebase';
    const { password, passcode, ...safeUser } = user;

    return {
        ...safeUser,
        hasPassword,
        migrationStatus
    };
};

class UserController {
    constructor() {
        this.getAllUsers = this.getAllUsers.bind(this);
        this.getMigrationSummary = this.getMigrationSummary.bind(this);
        this.getUserById = this.getUserById.bind(this);
        this.getUserByEmail = this.getUserByEmail.bind(this);
        this.updateProfile = this.updateProfile.bind(this);
        this.getUserSubcollection = this.getUserSubcollection.bind(this);
    }

    /**
     * Get all users with pagination
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getAllUsers(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                search = '',
                status = '',
                kycStatus = '',
                agent,
                sortBy = 'createdAt',
                sortOrder = 'desc'
            } = req.query;

            // Build Firestore query with simple equality filters
            const filter = {};
            if (status) filter.status = status;
            if (kycStatus) filter.kycStatus = kycStatus;
            if (agent === true || agent === false) filter.agent = agent;
            if (agent === 'true') filter.agent = true;
            if (agent === 'false') filter.agent = false;

            // Fetch all matching users from Firestore
            let users = await User.findMany(filter);

            // Apply search filter in memory (Firestore doesn't support regex)
            if (search) {
                const safeSearch = escapeRegex(search);
                const searchRegex = new RegExp(safeSearch, 'i');
                users = users.filter(user =>
                    searchRegex.test(user.firstName || '') ||
                    searchRegex.test(user.lastName || '') ||
                    searchRegex.test(user.emailAddress || '') ||
                    searchRegex.test(user.accountNumber || '') ||
                    searchRegex.test(user.agentNumber || '') ||
                    searchRegex.test(user.agentCode || '')
                );
            }

            // Sort in memory
            const sortDirection = sortOrder === 'asc' ? 1 : -1;
            users.sort((a, b) => {
                const aVal = a[sortBy];
                const bVal = b[sortBy];
                if (aVal === undefined && bVal === undefined) return 0;
                if (aVal === undefined) return 1;
                if (bVal === undefined) return -1;
                if (aVal > bVal) return sortDirection;
                if (aVal < bVal) return -sortDirection;
                return 0;
            });

            // Calculate pagination
            const total = users.length;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const pagedUsers = users.slice(skip, skip + parseInt(limit));

            // Remove sensitive fields
            const sanitizedUsers = pagedUsers.map(buildSafeUser);

            res.json({
                success: true,
                data: {
                    users: sanitizedUsers,
                    pagination: {
                        total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(total / parseInt(limit))
                    }
                }
            });
        } catch (error) {
            console.error('Controller error fetching users:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch users'
            });
        }
    }

    /**
     * Update current user profile
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async updateProfile(req, res) {
        try {
            const userId = req.userId || req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User ID not found in token'
                });
            }

            const { firstName, lastName, preferredLanguage } = req.body;
            const updateData = {};

            if (firstName !== undefined) updateData.firstName = firstName;
            if (lastName !== undefined) updateData.lastName = lastName;
            if (preferredLanguage !== undefined) updateData.preferredLanguage = preferredLanguage;

            if (Object.keys(updateData).length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No update fields provided'
                });
            }

            updateData.updatedAt = new Date();

            await User.updateById(userId, updateData);
            const updatedUser = await User.findById(userId);

            if (!updatedUser) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const safeUser = buildSafeUser(updatedUser);

            res.json({
                success: true,
                data: safeUser
            });
        } catch (error) {
            console.error('Controller error updating profile:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update profile'
            });
        }
    }

    /**
     * Get a user subcollection by name for the current user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getUserSubcollection(req, res) {
        try {
            const userId = req.userId || req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User ID not found in token'
                });
            }

            const { name } = req.params;
            const {
                page = 1,
                limit = 200,
                sortBy = '',
                sortOrder = 'desc'
            } = req.query;

            const user = await User.findById(userId);
            const items = user?.subcollections?.[name] || [];

            let sortedItems = items;
            if (sortBy) {
                const direction = sortOrder === 'asc' ? 1 : -1;
                sortedItems = [...items].sort((a, b) => {
                    const aValue = a?.[sortBy];
                    const bValue = b?.[sortBy];
                    if (aValue === undefined && bValue === undefined) return 0;
                    if (aValue === undefined) return 1;
                    if (bValue === undefined) return -1;
                    if (aValue > bValue) return direction;
                    if (aValue < bValue) return -direction;
                    return 0;
                });
            }

            const pageValue = Number.parseInt(page, 10) || 1;
            const limitValue = Number.parseInt(limit, 10) || items.length || 0;
            const skip = (pageValue - 1) * limitValue;
            const pagedItems = limitValue > 0
                ? sortedItems.slice(skip, skip + limitValue)
                : sortedItems;

            res.json({
                success: true,
                data: {
                    items: pagedItems,
                    pagination: {
                        total: items.length,
                        page: pageValue,
                        limit: limitValue,
                        totalPages: limitValue > 0 ? Math.ceil(items.length / limitValue) : 1
                    }
                }
            });
        } catch (error) {
            console.error('Controller error fetching subcollection:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch subcollection'
            });
        }
    }

    /**
     * Get migration summary counts for Firebase users
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getMigrationSummary(req, res) {
        try {
            // Fetch all users and compute summary in memory
            const allUsers = await User.findMany({});

            const totalUsers = allUsers.length;
            let firebaseUsers = 0;
            let firebasePasswordSet = 0;

            for (const user of allUsers) {
                if (user.migratedFromFirebase || user.migrationDate) {
                    firebaseUsers++;
                    if (user.password) {
                        firebasePasswordSet++;
                    }
                }
            }

            const summary = {
                totalUsers,
                firebaseUsers,
                firebasePasswordSet,
                firebasePasswordNeeded: firebaseUsers - firebasePasswordSet,
                nativeUsers: totalUsers - firebaseUsers
            };

            res.json({
                success: true,
                data: summary
            });
        } catch (error) {
            console.error('Controller error fetching migration summary:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch migration summary'
            });
        }
    }

    /**
     * Get user by ID (Firebase userId or Firestore doc ID)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getUserById(req, res) {
        try {
            const { id } = req.params;

            // Try to find by userId field first
            let user = await User.findByUserId(id);

            // findByUserId already checks doc ID and userId field
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Remove sensitive fields
            const safeUser = buildSafeUser(user);

            res.json({
                success: true,
                data: safeUser
            });
        } catch (error) {
            console.error('Controller error fetching user by ID:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch user'
            });
        }
    }

    /**
     * Get user by email
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getUserByEmail(req, res) {
        try {
            const { email } = req.params;
            const user = await User.findByEmail(email.toLowerCase());

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Remove sensitive fields
            const safeUser = buildSafeUser(user);

            res.json({
                success: true,
                data: safeUser
            });
        } catch (error) {
            console.error('Controller error fetching user by email:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch user'
            });
        }
    }
}

module.exports = new UserController();
