const BaseModel = require('./BaseModel');

/**
 * User Model - Handles all user-related database operations
 * Extends BaseModel for common CRUD functionality
 *
 * @class User
 * @extends BaseModel
 */
class User extends BaseModel {
    constructor() {
        super('users');
    }

    /**
     * Create a new user
     * @param {Object} userData - User data
     * @returns {Promise<Object>} Created user
     */
    async create(userData) {
        const doc = {
            ...userData,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date()
        };

        // Use userId (Firebase UID) as document ID if available
        if (doc.userId) {
            return await this.insertWithId(doc.userId, doc);
        }

        return await this.insertOne(doc);
    }

    /**
     * Find user by email
     * @param {string} email - Email address
     * @returns {Promise<Object|null>} User or null
     */
    async findByEmail(email) {
        return await this.findOne({ emailAddress: email });
    }

    /**
     * Find user by account number
     * @param {string} accountNumber - Account number
     * @returns {Promise<Object|null>} User or null
     */
    async findByAccountNumber(accountNumber) {
        return await this.findOne({ accountNumber });
    }

    /**
     * Find user by userId (Firebase UID)
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} User or null
     */
    async findByUserId(userId) {
        // Try direct doc lookup first (userId is the doc ID)
        const byDocId = await this.findById(userId);
        if (byDocId) return byDocId;

        // Fallback to field query
        return await this.findOne({ userId });
    }

    /**
     * Update user by email
     * @param {string} email - Email address
     * @param {Object} updateData - Data to update
     * @returns {Promise<boolean>} Success status
     */
    async update(email, updateData) {
        return await this.updateOne({ emailAddress: email }, updateData);
    }

    /**
     * Update last signed in timestamp
     * @param {string} email - Email address
     * @returns {Promise<boolean>} Success status
     */
    async updateLastSignedIn(email) {
        return await this.update(email, { lastSignedIn: new Date() });
    }

    /**
     * Check if email exists
     * @param {string} email - Email address
     * @returns {Promise<boolean>} Exists status
     */
    async emailExists(email) {
        return await this.exists({ emailAddress: email });
    }

    /**
     * Check if account number exists
     * @param {string} accountNumber - Account number
     * @returns {Promise<boolean>} Exists status
     */
    async accountNumberExists(accountNumber) {
        return await this.exists({ accountNumber });
    }

    /**
     * Generate unique account number (12 digits starting with 0000)
     * @returns {Promise<string>} Unique account number
     */
    async generateUniqueAccountNumber() {
        try {
            let attempts = 0;
            const maxAttempts = 100;

            while (attempts < maxAttempts) {
                // Generate 8 random digits (since we need 12 total and start with 0000)
                const randomDigits = Math.floor(Math.random() * 100000000)
                    .toString()
                    .padStart(8, '0');
                const accountNumber = `0000${randomDigits}`;

                // Check if account number already exists
                const exists = await this.accountNumberExists(accountNumber);
                if (!exists) {
                    return accountNumber;
                }

                attempts++;
            }

            throw new Error('Unable to generate unique account number after maximum attempts');
        } catch (error) {
            console.error('Error generating account number:', error);
            throw error;
        }
    }

    /**
     * Get all users with optional filtering and pagination
     * @param {Object} filter - Filter options
     * @param {Object} options - Query options (sort, limit, skip)
     * @returns {Promise<Array>} Array of users
     */
    async findAll(filter = {}, options = {}) {
        return await this.findMany(filter, options);
    }

    /**
     * Search users by name or email (in-memory filtering)
     * @param {string} searchTerm - Search term
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of matching users
     */
    async search(searchTerm, options = {}) {
        // Firestore doesn't support regex - fetch all and filter in memory
        const allUsers = await this.findMany({}, options);
        const regex = new RegExp(searchTerm, 'i');

        return allUsers.filter(user =>
            regex.test(user.firstName || '') ||
            regex.test(user.lastName || '') ||
            regex.test(user.emailAddress || '') ||
            regex.test(user.accountNumber || '')
        );
    }
}

// Export singleton instance for backward compatibility
// Also export the class for testing and dependency injection
const userInstance = new User();
module.exports = userInstance;
module.exports.User = User;
