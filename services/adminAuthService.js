const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getFirebaseAdmin } = require('../config/firebase');

/**
 * AdminAuthService - Handles authentication for admin users via Firebase Realtime Database
 * Uses the /adminUsers path in Firebase RTDB
 */
class AdminAuthService {
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'inspire-wallet-secret-key-change-in-production';
        this.jwtExpiry = process.env.JWT_EXPIRY || '7d';
    }

    /**
     * Generate JWT token for admin
     * @param {Object} payload - Token payload
     * @returns {string} JWT token
     */
    generateToken(payload) {
        const jwtId = crypto.randomUUID();
        return jwt.sign(payload, this.jwtSecret, {
            expiresIn: this.jwtExpiry,
            jwtid: jwtId
        });
    }

    /**
     * Get Firebase Realtime Database reference
     * @returns {admin.database.Database}
     */
    getDatabase() {
        const app = getFirebaseAdmin();
        if (!app) {
            throw new Error('Firebase Admin SDK not initialized');
        }
        return admin.database();
    }

    /**
     * Get admin user by ID from Firebase RTDB
     * @param {string} adminId - Firebase UID / Admin ID
     * @returns {Promise<Object|null>} Admin user data
     */
    async getAdminById(adminId) {
        try {
            const db = this.getDatabase();
            const snapshot = await db.ref(`adminUsers/${adminId}`).once('value');

            if (!snapshot.exists()) {
                return null;
            }

            return {
                id: adminId,
                ...snapshot.val()
            };
        } catch (error) {
            console.error('Error fetching admin by ID:', error);
            throw error;
        }
    }

    /**
     * Get admin user by email from Firebase RTDB
     * @param {string} email - Email address
     * @returns {Promise<Object|null>} Admin user data with ID
     */
    async getAdminByEmail(email) {
        try {
            const db = this.getDatabase();
            const snapshot = await db.ref('adminUsers').orderByChild('email').equalTo(email.toLowerCase().trim()).once('value');

            if (!snapshot.exists()) {
                return null;
            }

            // Get the first matching admin
            let adminData = null;
            snapshot.forEach((childSnapshot) => {
                adminData = {
                    id: childSnapshot.key,
                    ...childSnapshot.val()
                };
                return true; // Stop after first match
            });

            return adminData;
        } catch (error) {
            console.error('Error fetching admin by email:', error);
            throw error;
        }
    }

    /**
     * Verify Firebase ID token and check if user is admin
     * @param {string} idToken - Firebase ID token from client
     * @returns {Promise<Object>} Admin user data
     */
    async verifyAdminToken(idToken) {
        try {
            const app = getFirebaseAdmin();
            if (!app) {
                throw new Error('Firebase Admin SDK not initialized');
            }

            // Verify the Firebase ID token
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;
            const email = decodedToken.email;

            // Check if user exists in adminUsers collection
            let adminUser = await this.getAdminById(uid);

            // If not found by UID, try by email
            if (!adminUser && email) {
                adminUser = await this.getAdminByEmail(email);
            }

            if (!adminUser) {
                throw new Error('User is not an admin');
            }

            // Check if admin has proper role
            if (adminUser.role !== 'admin' && adminUser.role !== 'superadmin') {
                throw new Error('Insufficient admin privileges');
            }

            return adminUser;
        } catch (error) {
            console.error('Error verifying admin token:', error);
            throw error;
        }
    }

    /**
     * Login admin user using Firebase Authentication
     * The client should authenticate with Firebase first, then send the ID token
     * @param {string} firebaseIdToken - Firebase ID token from client-side auth
     * @returns {Promise<Object>} Login result with JWT token
     */
    async loginWithFirebaseToken(firebaseIdToken) {
        try {
            if (!firebaseIdToken) {
                throw new Error('Firebase ID token is required');
            }

            // Verify token and get admin data
            const adminUser = await this.verifyAdminToken(firebaseIdToken);

            // Update last signed in timestamp
            const db = this.getDatabase();
            await db.ref(`adminUsers/${adminUser.id}/lastSignedIn`).set(admin.database.ServerValue.TIMESTAMP);

            // Generate JWT for session management
            const token = this.generateToken({
                adminId: adminUser.id,
                email: adminUser.email,
                name: adminUser.name,
                role: adminUser.role
            });

            return {
                success: true,
                user: {
                    _id: adminUser.id,
                    email: adminUser.email,
                    name: adminUser.name,
                    role: adminUser.role,
                    assignedUsersCount: adminUser.assignedUsersCount || 0,
                    createdAt: adminUser.createdAt
                },
                token
            };
        } catch (error) {
            console.error('Admin login error:', error);
            throw error;
        }
    }

    /**
     * Login admin with email/password via Firebase Authentication REST API
     * This performs server-side password verification using Firebase's signInWithPassword endpoint
     * Then checks/creates admin record in Firebase RTDB /adminUsers
     * @param {string} email - Admin email
     * @param {string} password - Admin password
     * @returns {Promise<Object>} Login result
     */
    async loginWithCredentials(email, password) {
        try {
            if (!email || !password) {
                throw new Error('Email and password are required');
            }

            const normalizedEmail = email.toLowerCase().trim();

            // Verify password using Firebase REST API FIRST
            const firebaseApiKey = process.env.FIREBASE_API_KEY;

            if (!firebaseApiKey) {
                throw new Error('Firebase API Key not configured. Add FIREBASE_API_KEY to .env');
            }

            // Use Firebase REST API to verify credentials
            const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`;

            let firebaseAuthData;
            try {
                const response = await fetch(signInUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: normalizedEmail,
                        password: password,
                        returnSecureToken: true
                    })
                });

                const data = await response.json();

                if (!response.ok || data.error) {
                    console.error('Firebase auth error:', data.error?.message);
                    throw new Error('Invalid email or password');
                }

                firebaseAuthData = data;
                console.log('✅ Admin authenticated via Firebase REST API:', normalizedEmail);
            } catch (fetchError) {
                if (fetchError.message === 'Invalid email or password') {
                    throw fetchError;
                }
                console.error('Firebase REST API error:', fetchError);
                throw new Error('Invalid email or password');
            }

            // Get the Firebase UID from the auth response
            const firebaseUid = firebaseAuthData.localId;
            const displayName = firebaseAuthData.displayName || '';

            // Check if admin exists in RTDB
            let adminUser = await this.getAdminById(firebaseUid);

            // If not found by UID, try by email
            if (!adminUser) {
                adminUser = await this.getAdminByEmail(normalizedEmail);
            }

            const db = this.getDatabase();

            // If admin doesn't exist in RTDB, create a new admin record
            if (!adminUser) {
                console.log('📝 Creating new admin record in /adminUsers for:', normalizedEmail);

                const adminRecord = {
                    email: normalizedEmail,
                    name: displayName || normalizedEmail.split('@')[0],
                    role: 'admin',
                    assignedUsersCount: 0,
                    createdAt: admin.database.ServerValue.TIMESTAMP,
                    lastSignedIn: admin.database.ServerValue.TIMESTAMP
                };

                await db.ref(`adminUsers/${firebaseUid}`).set(adminRecord);

                adminUser = {
                    id: firebaseUid,
                    ...adminRecord,
                    createdAt: Date.now()
                };

                console.log('✅ Admin record created in /adminUsers');
            } else {
                // Update last signed in
                await db.ref(`adminUsers/${adminUser.id}/lastSignedIn`).set(admin.database.ServerValue.TIMESTAMP);
            }

            // Generate JWT
            const token = this.generateToken({
                adminId: adminUser.id,
                email: adminUser.email,
                name: adminUser.name,
                role: adminUser.role
            });

            return {
                success: true,
                user: {
                    _id: adminUser.id,
                    email: adminUser.email,
                    name: adminUser.name,
                    role: adminUser.role,
                    assignedUsersCount: adminUser.assignedUsersCount || 0,
                    createdAt: adminUser.createdAt
                },
                token
            };
        } catch (error) {
            console.error('Admin login with credentials error:', error);
            throw error;
        }
    }

    /**
     * Register a new admin user
     * @param {Object} adminData - Admin registration data
     * @returns {Promise<Object>} Registration result
     */
    async register(adminData) {
        try {
            const { name, email, password, role = 'admin' } = adminData;

            if (!name || !email || !password) {
                throw new Error('Name, email, and password are required');
            }

            // Check if admin already exists
            const existingAdmin = await this.getAdminByEmail(email);
            if (existingAdmin) {
                throw new Error('Admin with this email already exists');
            }

            const app = getFirebaseAdmin();
            if (!app) {
                throw new Error('Firebase Admin SDK not initialized');
            }

            // Create user in Firebase Authentication
            let firebaseUser;
            try {
                firebaseUser = await admin.auth().createUser({
                    email: email.toLowerCase().trim(),
                    password: password,
                    displayName: name
                });
            } catch (firebaseError) {
                if (firebaseError.code === 'auth/email-already-exists') {
                    throw new Error('Email is already registered in Firebase');
                }
                throw firebaseError;
            }

            // Create admin record in Firebase RTDB
            const db = this.getDatabase();
            const adminRecord = {
                email: email.toLowerCase().trim(),
                name: name,
                role: role,
                assignedUsersCount: 0,
                createdAt: admin.database.ServerValue.TIMESTAMP,
                lastSignedIn: admin.database.ServerValue.TIMESTAMP
            };

            await db.ref(`adminUsers/${firebaseUser.uid}`).set(adminRecord);

            // Generate JWT
            const token = this.generateToken({
                adminId: firebaseUser.uid,
                email: email.toLowerCase().trim(),
                name: name,
                role: role
            });

            return {
                success: true,
                user: {
                    _id: firebaseUser.uid,
                    email: email.toLowerCase().trim(),
                    name: name,
                    role: role,
                    assignedUsersCount: 0
                },
                token
            };
        } catch (error) {
            console.error('Admin registration error:', error);
            throw error;
        }
    }

    /**
     * Get admin profile
     * @param {string} adminId - Admin ID
     * @returns {Promise<Object>} Admin profile
     */
    async getProfile(adminId) {
        try {
            const adminUser = await this.getAdminById(adminId);

            if (!adminUser) {
                throw new Error('Admin not found');
            }

            return {
                _id: adminUser.id,
                email: adminUser.email,
                name: adminUser.name,
                role: adminUser.role,
                assignedUsersCount: adminUser.assignedUsersCount || 0,
                createdAt: adminUser.createdAt
            };
        } catch (error) {
            console.error('Get admin profile error:', error);
            throw error;
        }
    }
}

module.exports = new AdminAuthService();
