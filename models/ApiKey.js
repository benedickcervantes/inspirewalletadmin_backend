const BaseModel = require('./BaseModel');
const cryptoUtils = require('../utils/cryptoUtils');

/**
 * ApiKey Model - Handles API key storage and validation
 * Extends BaseModel for common CRUD functionality
 *
 * @class ApiKey
 * @extends BaseModel
 */
class ApiKey extends BaseModel {
    constructor() {
        super('apiKeys');
    }

    /**
     * Save a new API key (uses hashedKey as document ID)
     * @param {string} apiKey - The API key to save
     * @param {string} description - Description of the API key
     * @returns {Promise<string>} Hashed key
     */
    async save(apiKey, description = '') {
        const hashedKey = cryptoUtils.hash(apiKey);
        const encryptedKey = cryptoUtils.encrypt(apiKey);

        const doc = {
            hashedKey,
            encryptedKey,
            description,
            createdAt: new Date(),
            lastUsed: null,
            isActive: true
        };

        await this.insertWithId(hashedKey, doc);
        return hashedKey;
    }

    /**
     * Validate an API key (direct doc lookup by hashedKey)
     * @param {string} apiKey - The API key to validate
     * @returns {Promise<boolean>} Whether the API key is valid
     */
    async validate(apiKey) {
        try {
            const hashedKey = cryptoUtils.hash(apiKey);
            const doc = await this.findById(hashedKey);

            if (doc && doc.isActive) {
                // Update lastUsed timestamp
                await this.updateById(hashedKey, { lastUsed: new Date() });
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error validating API key:', error);
            return false;
        }
    }

    /**
     * List all API keys (returns only safe information)
     * @returns {Promise<Array>} List of API keys
     */
    async list() {
        const docs = await this.findMany({});

        return docs.map(doc => ({
            hashedKey: doc.hashedKey,
            description: doc.description,
            createdAt: doc.createdAt,
            lastUsed: doc.lastUsed,
            isActive: doc.isActive
        }));
    }

    /**
     * Decrypt a specific API key by its hash (direct doc lookup)
     * @param {string} hashedKey - The hashed API key to decrypt
     * @returns {Promise<string>} Decrypted API key
     */
    async decrypt(hashedKey) {
        const doc = await this.findById(hashedKey);

        if (!doc) {
            throw new Error('API key not found');
        }

        return cryptoUtils.decrypt(doc.encryptedKey);
    }

    /**
     * Deactivate an API key
     * @param {string} hashedKey - The hashed API key to deactivate
     * @returns {Promise<boolean>} Success status
     */
    async deactivate(hashedKey) {
        return await this.updateById(hashedKey, { isActive: false });
    }

    /**
     * Reactivate an API key
     * @param {string} hashedKey - The hashed API key to reactivate
     * @returns {Promise<boolean>} Success status
     */
    async reactivate(hashedKey) {
        return await this.updateById(hashedKey, { isActive: true });
    }

    /**
     * Delete an API key permanently
     * @param {string} hashedKey - The hashed API key to delete
     * @returns {Promise<boolean>} Success status
     */
    async remove(hashedKey) {
        return await this.deleteById(hashedKey);
    }

    /**
     * Get API key statistics
     * @returns {Promise<Object>} Statistics object
     */
    async getStats() {
        const [total, active, inactive] = await Promise.all([
            this.count({}),
            this.count({ isActive: true }),
            this.count({ isActive: false })
        ]);

        return { total, active, inactive };
    }
}

// Export singleton instance for backward compatibility
// Also export the class for testing and dependency injection
const apiKeyInstance = new ApiKey();
module.exports = apiKeyInstance;
module.exports.ApiKey = ApiKey;
