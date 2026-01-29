const User = require('../models/User');
const authService = require('./authService');
const { getFirestore, verifyIdToken } = require('../config/firebase');

const normalizeEmail = (value) => (value || '')
    .toString()
    .trim()
    .toLowerCase();

const getMinPasswordLength = () => {
    const parsed = Number.parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10);
    return Number.isNaN(parsed) ? 8 : parsed;
};

class MigrationService {
    /**
     * Verify Firebase token and get user data
     * @param {string} firebaseToken - Firebase ID token
     * @returns {Promise<Object>} Firebase user data
     */
    async verifyFirebaseUser(firebaseToken) {
        try {
            const decodedToken = await verifyIdToken(firebaseToken);
            return {
                uid: decodedToken.uid,
                email: decodedToken.email
            };
        } catch (error) {
            throw new Error('Invalid Firebase token');
        }
    }

    /**
     * Get user data from Firebase Firestore
     * @param {string} userId - Firebase user ID (UID)
     * @returns {Promise<Object|null>} User data from Firestore
     */
    async getFirebaseUserData(userId) {
        try {
            const db = getFirestore();
            const userDoc = await db.collection('users').doc(userId).get();

            if (!userDoc.exists) {
                return null;
            }

            return {
                id: userDoc.id,
                ...userDoc.data()
            };
        } catch (error) {
            console.error('Error getting Firebase user data:', error);
            throw error;
        }
    }

    /**
     * Check if user exists in Firestore
     * @param {string} userId - Firebase user ID
     * @param {string} email - User email
     * @returns {Promise<Object|null>} User from Firestore or null
     */
    async checkUserExists(userId, email) {
        try {
            // Check by Firebase userId first
            if (userId) {
                const userByUserId = await User.findByUserId(userId);
                if (userByUserId) return userByUserId;
            }

            // Check by email
            if (email) {
                const userByEmail = await User.findByEmail(email);
                if (userByEmail) return userByEmail;
            }

            return null;
        } catch (error) {
            console.error('Error checking user exists:', error);
            throw error;
        }
    }

    validateMongoUserMatch(firebaseUser, mongoUser) {
        if (!mongoUser) {
            return {
                matches: false,
                reason: 'not_found',
                message: 'No matching account found. Please contact support.'
            };
        }

        const mongoEmail = normalizeEmail(mongoUser.emailAddress);
        const firebaseEmail = normalizeEmail(firebaseUser?.email);
        if (!mongoEmail || !firebaseEmail || mongoEmail !== firebaseEmail) {
            return {
                matches: false,
                reason: 'email_mismatch',
                message: 'Firebase email does not match our records.'
            };
        }

        if (mongoUser.userId && mongoUser.userId !== firebaseUser?.uid) {
            return {
                matches: false,
                reason: 'uid_mismatch',
                message: 'Firebase account does not match the existing user record.'
            };
        }

        return { matches: true };
    }

    /**
     * Migrate user from Firebase to Firestore with password
     * @param {string} firebaseToken - Firebase ID token
     * @param {string} newPassword - New password to set
     * @returns {Promise<Object>} Migration result
     */
    async migrateUser(firebaseToken, newPassword) {
        try {
            // Verify Firebase token
            const firebaseUser = await this.verifyFirebaseUser(firebaseToken);
            const firebaseUserId = firebaseUser.uid;
            const firebaseEmail = firebaseUser.email;

            // Check if user already migrated
            const existingUser = await this.checkUserExists(firebaseUserId, firebaseEmail);
            const matchResult = this.validateMongoUserMatch(firebaseUser, existingUser);
            if (!matchResult.matches) {
                throw new Error(matchResult.message);
            }
            if (existingUser && existingUser.password) {
                throw new Error('User already migrated. Please use regular login.');
            }

            // Validate password
            const minPasswordLength = getMinPasswordLength();
            if (!newPassword || newPassword.length < minPasswordLength) {
                throw new Error(`Password must be at least ${minPasswordLength} characters long`);
            }

            // Hash password
            const hashedPassword = await authService.hashPassword(newPassword);

            const now = new Date();
            const updateData = {
                password: hashedPassword,
                migratedFromFirebase: true,
                migrationDate: now,
                lastSignedIn: now
            };
            if (!existingUser.userId) {
                updateData.userId = firebaseUserId;
            }

            await User.update(existingUser.emailAddress, updateData);
            const user = await User.findByEmail(firebaseEmail);

            // Generate JWT token
            const userId = user.id || user.userId;
            const token = authService.generateToken({
                userId,
                email: user.emailAddress,
                accountNumber: user.accountNumber
            });

            // Remove password from response
            const { password: _, ...userWithoutPassword } = user;

            return {
                success: true,
                message: 'User migrated successfully',
                user: userWithoutPassword,
                token
            };
        } catch (error) {
            console.error('Migration error:', error);
            throw error;
        }
    }

    /**
     * Check if user needs migration (exists in Firebase but not in Firestore with password)
     * @param {string} firebaseToken - Firebase ID token
     * @returns {Promise<Object>} Migration status
     */
    async checkMigrationStatus(firebaseToken) {
        try {
            // Verify Firebase token
            const firebaseUser = await this.verifyFirebaseUser(firebaseToken);
            const firebaseUserId = firebaseUser.uid;
            const firebaseEmail = firebaseUser.email;

            // Check if user exists in Firestore
            const mongoUser = await this.checkUserExists(firebaseUserId, firebaseEmail);
            const matchResult = this.validateMongoUserMatch(firebaseUser, mongoUser);
            if (!matchResult.matches) {
                return {
                    needsMigration: false,
                    blocked: true,
                    reason: matchResult.reason,
                    message: matchResult.message
                };
            }

            if (!mongoUser.password) {
                return {
                    needsMigration: true,
                    message: 'User exists but password not set. Please set password.',
                    firebaseUserId,
                    email: firebaseEmail,
                    userExists: true
                };
            }

            return {
                needsMigration: false,
                message: 'User already migrated',
                user: mongoUser
            };
        } catch (error) {
            console.error('Error checking migration status:', error);
            throw error;
        }
    }
}

module.exports = new MigrationService();
