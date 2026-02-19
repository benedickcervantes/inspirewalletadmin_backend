const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getFirebaseAdmin, getFirestore } = require('../config/firebase');

/**
 * AdminAuthService - Handles authentication for admin users via Firebase Firestore
 * Uses the adminUsers/{uid} collection in Firestore
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
     * Get admin user by ID from Firestore
     * @param {string} adminId - Firebase UID / Admin ID
     * @returns {Promise<Object|null>} Admin user data
     */
    async getAdminById(adminId) {
        try {
            const db = getFirestore();
            const docRef = db.collection('adminUsers').doc(adminId);
            const doc = await docRef.get();

            if (!doc.exists) {
                return null;
            }

            return {
                id: doc.id,
                ...doc.data()
            };
        } catch (error) {
            console.error('Error fetching admin by ID:', error);
            throw error;
        }
    }

    /**
     * Get admin user by email from Firestore
     * @param {string} email - Email address
     * @returns {Promise<Object|null>} Admin user data with ID
     */
    async getAdminByEmail(email) {
        try {
            const db = getFirestore();
            const normalizedEmail = email.toLowerCase().trim();
            const snapshot = await db.collection('adminUsers')
                .where('email', '==', normalizedEmail)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return {
                id: doc.id,
                ...doc.data()
            };
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

            // Check if user exists in adminUsers Firestore collection
            let adminUser = await this.getAdminById(uid);

            // If not found by UID, try by email
            if (!adminUser && email) {
                adminUser = await this.getAdminByEmail(email);
            }

            if (!adminUser) {
                throw new Error('User is not an admin');
            }

            // Check if admin has proper role or specialrole
            const hasAdminRole = adminUser.role === 'admin' || adminUser.role === 'superadmin';
            const hasSpecialRole = adminUser.specialrole === 'superadmin';
            
            if (!hasAdminRole && !hasSpecialRole) {
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

            // Update last signed in timestamp in Firestore
            const db = getFirestore();
            await db.collection('adminUsers').doc(adminUser.id).update({
                lastSignedIn: admin.firestore.FieldValue.serverTimestamp()
            });

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
                    specialrole: adminUser.specialrole,
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
     * Then checks admin record in Firestore adminUsers collection (does NOT auto-create)
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

            // Verify password using Firebase REST API
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

            // Check if admin exists in Firestore adminUsers
            let adminUser = await this.getAdminById(firebaseUid);

            // If not found by UID, try by email
            if (!adminUser) {
                adminUser = await this.getAdminByEmail(normalizedEmail);
            }

            if (!adminUser) {
                throw new Error('User is not authorized as an admin');
            }

            // Check admin privileges
            const hasAdminRole = adminUser.role === 'admin' || adminUser.role === 'superadmin';
            const hasSpecialRole = adminUser.specialrole === 'superadmin';
            
            if (!hasAdminRole && !hasSpecialRole) {
                throw new Error('Insufficient admin privileges');
            }

            // Update last signed in timestamp
            const db = getFirestore();
            await db.collection('adminUsers').doc(adminUser.id).update({
                lastSignedIn: admin.firestore.FieldValue.serverTimestamp()
            });

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
                    specialrole: adminUser.specialrole,
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
     * Creates user in Firebase Auth and admin record in Firestore adminUsers
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

            // Create admin record in Firestore
            const db = getFirestore();
            const adminRecord = {
                email: email.toLowerCase().trim(),
                name: name,
                role: role,
                assignedUsersCount: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastSignedIn: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('adminUsers').doc(firebaseUser.uid).set(adminRecord);

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
                specialrole: adminUser.specialrole,
                assignedUsersCount: adminUser.assignedUsersCount || 0,
                createdAt: adminUser.createdAt
            };
        } catch (error) {
            console.error('Get admin profile error:', error);
            throw error;
        }
    }

    /**
     * Verify admin password using Firebase Authentication
     * @param {string} email - Admin email
     * @param {string} password - Password to verify
     * @returns {Promise<boolean>} True if password is valid
     */
    async verifyPassword(email, password) {
        try {
            if (!email || !password) {
                throw new Error('Email and password are required');
            }

            const normalizedEmail = email.toLowerCase().trim();
            const firebaseApiKey = process.env.FIREBASE_API_KEY;

            if (!firebaseApiKey) {
                throw new Error('Firebase API Key not configured');
            }

            // Use Firebase REST API to verify credentials
            const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`;

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
                console.error('Password verification failed:', data.error?.message);
                return false;
            }

            console.log('✅ Password verified for admin:', normalizedEmail);
            return true;
        } catch (error) {
            console.error('Password verification error:', error);
            return false;
        }
    }
}

module.exports = new AdminAuthService();
