const crypto = require('crypto');
const logger = require('./logger');

class CryptoUtils {
    constructor() {
        // Encryption settings
        this.algorithm = 'aes-256-gcm';
        const secret = process.env.ENCRYPTION_SECRET || 'inspire-wallet-default-secret-key-change-in-production';
        const salt = process.env.ENCRYPTION_SALT || 'inspire-wallet-default-salt';

        if (secret.includes('change-in-production')) {
            logger.warn('ENCRYPTION_SECRET is using the default value. Set a strong secret in production.');
        }

        // Use environment variable or default secret
        this.encryptionKey = crypto.scryptSync(secret, salt, 32);
    }

    /**
     * Generate a new API key
     * @returns {string} Generated API key (64 hex characters)
     */
    generateApiKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Hash data using SHA-256
     * @param {string} text - Text to hash
     * @returns {string} Hashed text
     */
    hash(text) {
        return crypto.createHash('sha256').update(text).digest('hex');
    }

    /**
     * Encrypt data using AES-256-GCM
     * @param {string} text - Text to encrypt
     * @returns {Object} Encrypted data with iv and tag
     */
    encrypt(text) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag();

        return {
            encrypted,
            iv: iv.toString('hex'),
            tag: tag.toString('hex')
        };
    }

    /**
     * Decrypt data using AES-256-GCM
     * @param {Object} encryptedData - Object containing encrypted data, iv, and tag
     * @returns {string} Decrypted text
     */
    decrypt(encryptedData) {
        const decipher = crypto.createDecipheriv(
            this.algorithm,
            this.encryptionKey,
            Buffer.from(encryptedData.iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}

module.exports = new CryptoUtils();


