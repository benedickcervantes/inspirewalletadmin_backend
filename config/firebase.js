const admin = require('firebase-admin');

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebase() {
    if (admin.apps.length > 0) {
        return admin.app();
    }

    try {
        // Try to get from environment variables first
        if (process.env.FIREBASE_PROJECT_ID && 
            process.env.FIREBASE_CLIENT_EMAIL && 
            process.env.FIREBASE_PRIVATE_KEY) {
            
            const serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            };

            const firebaseConfig = {
                credential: admin.credential.cert(serviceAccount)
            };

            if (process.env.FIREBASE_DATABASE_URL) {
                firebaseConfig.databaseURL = process.env.FIREBASE_DATABASE_URL;
            }

            admin.initializeApp(firebaseConfig);

            console.log('✅ Firebase Admin SDK initialized from environment variables');
            return admin.app();
        } else {
            console.warn('⚠️  Firebase Admin SDK not initialized: Missing environment variables');
            console.warn('⚠️  Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY');
            return null;
        }
    } catch (error) {
        console.error('❌ Error initializing Firebase Admin SDK:', error.message);
        return null;
    }
}

/**
 * Get Firebase Admin instance
 */
function getFirebaseAdmin() {
    if (admin.apps.length === 0) {
        return initializeFirebase();
    }
    return admin.app();
}

/**
 * Get Firestore instance
 */
function getFirestore() {
    const app = getFirebaseAdmin();
    if (!app) {
        throw new Error('Firebase Admin SDK not initialized');
    }
    return admin.firestore();
}

/**
 * Verify Firebase ID token
 * @param {string} idToken - Firebase ID token
 * @returns {Promise<Object>} Decoded token
 */
async function verifyIdToken(idToken) {
    try {
        const app = getFirebaseAdmin();
        if (!app) {
            throw new Error('Firebase Admin SDK not initialized');
        }
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        return decodedToken;
    } catch (error) {
        console.error('Error verifying Firebase token:', error);
        throw error;
    }
}

module.exports = {
    initializeFirebase,
    getFirebaseAdmin,
    getFirestore,
    verifyIdToken,
    admin
};

