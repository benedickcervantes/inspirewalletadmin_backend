const BaseModel = require('./BaseModel');
const { getFirestore } = require('../config/firebase');

/**
 * RefreshToken Model - Handles refresh token storage and management
 * Extends BaseModel for common CRUD functionality
 *
 * @class RefreshToken
 * @extends BaseModel
 */
class RefreshToken extends BaseModel {
    constructor() {
        super('refreshTokens');
    }

    /**
     * Create a new refresh token record (uses tokenHash as document ID)
     * @param {Object} tokenData - Token data
     * @returns {Promise<Object>} Created token record
     */
    async create(tokenData) {
        const doc = {
            ...tokenData,
            createdAt: new Date(),
            revokedAt: null,
            replacedByTokenHash: null
        };

        // Use tokenHash as document ID for fast lookups
        if (doc.tokenHash) {
            return await this.insertWithId(doc.tokenHash, doc);
        }

        return await this.insertOne(doc);
    }

    /**
     * Find refresh token by its hash (direct doc lookup)
     * @param {string} tokenHash - The hashed token
     * @returns {Promise<Object|null>} Token record or null
     */
    async findByHash(tokenHash) {
        // Direct document lookup by ID (tokenHash is the doc ID)
        const byDocId = await this.findById(tokenHash);
        if (byDocId) return byDocId;

        // Fallback to field query
        return await this.findOne({ tokenHash });
    }

    /**
     * Revoke a refresh token
     * @param {string} tokenHash - The hashed token
     * @param {Object} data - Additional data (replacedByTokenHash, revokedByIp)
     * @returns {Promise<boolean>} Success status
     */
    async revoke(tokenHash, data = {}) {
        // Try direct doc update first
        const updated = await this.updateById(tokenHash, {
            revokedAt: new Date(),
            ...data
        });
        if (updated) return true;

        // Fallback to field query
        return await this.updateOne(
            { tokenHash },
            {
                revokedAt: new Date(),
                ...data
            }
        );
    }

    /**
     * Revoke all refresh tokens for a user
     * @param {string} userId - User ID
     * @returns {Promise<number>} Number of tokens revoked
     */
    async revokeAllForUser(userId) {
        return await this.updateMany(
            { userId, revokedAt: null },
            { revokedAt: new Date() }
        );
    }

    /**
     * Find all active tokens for a user
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Array of active tokens
     */
    async findActiveByUser(userId) {
        const now = new Date();
        // Query for userId and revokedAt == null, then filter expiresAt in memory
        const tokens = await this.findMany({
            userId,
            revokedAt: null
        });

        return tokens.filter(token => !token.expiresAt || token.expiresAt > now);
    }

    /**
     * Check if a token is valid (not revoked and not expired)
     * @param {string} tokenHash - The hashed token
     * @returns {Promise<boolean>} Whether the token is valid
     */
    async isValid(tokenHash) {
        const token = await this.findByHash(tokenHash);
        if (!token) return false;
        if (token.revokedAt) return false;
        if (token.expiresAt && token.expiresAt < new Date()) return false;
        return true;
    }

    /**
     * Clean up expired tokens
     * @returns {Promise<number>} Number of tokens cleaned up
     */
    async cleanupExpired() {
        const now = new Date();
        const collection = this.getCollection();
        const snapshot = await collection.where('expiresAt', '<', now).get();

        if (snapshot.empty) return 0;

        const db = getFirestore();
        const batch = db.batch();
        for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
        }
        await batch.commit();
        return snapshot.size;
    }
}

// Export singleton instance for backward compatibility
// Also export the class for testing and dependency injection
const refreshTokenInstance = new RefreshToken();
module.exports = refreshTokenInstance;
module.exports.RefreshToken = RefreshToken;
