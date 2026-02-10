require('dotenv').config();

const { initializeFirebase, admin } = require('../config/firebase');
const User = require('../models/User');
const Agent = require('../models/Agent');
const agentService = require('../services/agentService');

const args = process.argv.slice(2);

const getArgValue = (name, fallback = null) => {
    const prefix = `--${name}=`;
    const arg = args.find((item) => item.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : fallback;
};

const hasFlag = (name) => args.includes(`--${name}`);

const dryRun = hasFlag('dry-run');
const skipAgents = hasFlag('skip-agents');
const verbose = hasFlag('verbose');
const limit = Number.parseInt(getArgValue('limit', '0'), 10) || 0;

const parseTimestamp = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }

    if (value instanceof Date) {
        return value;
    }

    // Handle Firestore Timestamp objects
    if (value && typeof value.toDate === 'function') {
        return value.toDate();
    }

    if (typeof value === 'number') {
        const ms = value < 1e12 ? value * 1000 : value;
        const date = new Date(ms);
        return Number.isNaN(date.getTime()) ? undefined : date;
    }

    if (typeof value === 'string') {
        const numeric = Number(value);
        if (!Number.isNaN(numeric)) {
            return parseTimestamp(numeric);
        }

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? undefined : date;
    }

    return undefined;
};

const pruneUndefined = (obj) => Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
);

const normalizeUser = (rawUser, firebaseUserId) => {
    const rawEmail = rawUser.emailAddress || rawUser.email || '';
    const emailAddress = typeof rawEmail === 'string' && rawEmail.trim()
        ? rawEmail.trim().toLowerCase()
        : undefined;

    const firstName = typeof rawUser.firstName === 'string'
        ? rawUser.firstName.trim()
        : rawUser.firstName;
    const lastName = typeof rawUser.lastName === 'string'
        ? rawUser.lastName.trim()
        : rawUser.lastName;

    const normalized = {
        ...rawUser,
        userId: firebaseUserId,
        emailAddress,
        firstName,
        lastName,
        accountNumber: rawUser.accountNumber ? String(rawUser.accountNumber) : undefined,
        agentNumber: rawUser.agentNumber !== undefined && rawUser.agentNumber !== null
            ? String(rawUser.agentNumber)
            : rawUser.agentNumber,
        agentCode: rawUser.agentCode !== undefined && rawUser.agentCode !== null
            ? String(rawUser.agentCode)
            : rawUser.agentCode,
        refferedAgent: rawUser.refferedAgent !== undefined && rawUser.refferedAgent !== null
            ? String(rawUser.refferedAgent)
            : rawUser.refferedAgent,
        createdAt: parseTimestamp(rawUser.createdAt),
        kycApprovedAt: parseTimestamp(rawUser.kycApprovedAt),
        lastLogin: parseTimestamp(rawUser.lastLogin),
        lastLogout: parseTimestamp(rawUser.lastLogout),
        lastSignedIn: parseTimestamp(rawUser.lastSignedIn),
        migratedFromFirebase: true,
        migrationDate: new Date()
    };

    delete normalized.password;

    return pruneUndefined(normalized);
};

const fetchSubcollections = async (db, userDocRef, verbose = false) => {
    const subcollections = {};

    try {
        const collections = await userDocRef.listCollections();

        for (const collectionRef of collections) {
            const collectionName = collectionRef.id;
            const snapshot = await collectionRef.get();

            if (!snapshot.empty) {
                subcollections[collectionName] = snapshot.docs.map(doc => {
                    const data = doc.data();
                    if (verbose) {
                        const fields = Object.keys(data);
                        console.log(`      📄 ${collectionName}/${doc.id} fields: [${fields.join(', ')}]`);
                    }
                    return {
                        _firebaseDocId: doc.id,
                        ...data
                    };
                });
            }
        }
    } catch (error) {
        console.error(`Error fetching subcollections: ${error.message}`);
    }

    return subcollections;
};

const logUserFields = (firebaseUserId, rawUser) => {
    const fields = Object.keys(rawUser);
    console.log(`\n👤 User: ${firebaseUserId}`);
    console.log(`   📋 User fields (${fields.length}): [${fields.join(', ')}]`);
};

/**
 * Associated collections that should be copied to user subcollections
 * These are top-level Firestore collections that reference users
 */
const ASSOCIATED_COLLECTIONS = [
    'agentRequest',
    'bankApplications',
    'depositRequests',
    'mayaApplications',
    'travelApplications'
];

/**
 * Fetch all associated collections and index them by userId
 * Returns a map: { collectionName: { userId: [docs] } }
 */
const fetchAssociatedCollections = async (db, verbose = false) => {
    const associatedData = {};

    console.log('\n📦 Fetching associated collections...');

    for (const collectionName of ASSOCIATED_COLLECTIONS) {
        try {
            const snapshot = await db.collection(collectionName).get();

            if (snapshot.empty) {
                console.log(`   ⚪ ${collectionName}: 0 documents`);
                continue;
            }

            // Index documents by userId
            const byUserId = {};
            let totalDocs = 0;

            for (const doc of snapshot.docs) {
                const data = doc.data();
                // Try different possible userId field names
                const userId = data.userId || data.uid || data.userUid || data.user_id;

                if (userId) {
                    if (!byUserId[userId]) {
                        byUserId[userId] = [];
                    }
                    byUserId[userId].push({
                        _firebaseDocId: doc.id,
                        ...data
                    });
                    totalDocs++;
                }
            }

            associatedData[collectionName] = byUserId;
            const userCount = Object.keys(byUserId).length;
            console.log(`   ✅ ${collectionName}: ${totalDocs} documents for ${userCount} users`);

            if (verbose && totalDocs > 0) {
                // Show sample fields from first document
                const firstUserId = Object.keys(byUserId)[0];
                const sampleDoc = byUserId[firstUserId][0];
                const fields = Object.keys(sampleDoc).filter(f => f !== '_firebaseDocId');
                console.log(`      Sample fields: [${fields.slice(0, 10).join(', ')}${fields.length > 10 ? '...' : ''}]`);
            }
        } catch (error) {
            console.error(`   ❌ ${collectionName}: Error - ${error.message}`);
        }
    }

    return associatedData;
};

/**
 * Get associated documents for a specific user
 */
const getAssociatedDocsForUser = (associatedData, userId) => {
    const userAssociatedDocs = {};

    for (const [collectionName, byUserId] of Object.entries(associatedData)) {
        const docs = byUserId[userId];
        if (docs && docs.length > 0) {
            userAssociatedDocs[collectionName] = docs;
        }
    }

    return userAssociatedDocs;
};

/**
 * Merge new subcollections with existing ones
 * - Adds new documents (by _firebaseDocId)
 * - Updates existing documents with same _firebaseDocId
 * - Keeps documents that exist in Firestore but not in source
 */
const mergeSubcollections = (existingSubcollections, newSubcollections) => {
    const merged = { ...existingSubcollections };

    for (const [collectionName, newDocs] of Object.entries(newSubcollections)) {
        const existingDocs = merged[collectionName] || [];

        // Create a map of existing docs by _firebaseDocId for quick lookup
        const existingDocsMap = new Map(
            existingDocs.map(doc => [doc._firebaseDocId, doc])
        );

        // Merge new docs: update existing or add new
        for (const newDoc of newDocs) {
            existingDocsMap.set(newDoc._firebaseDocId, {
                ...existingDocsMap.get(newDoc._firebaseDocId),
                ...newDoc
            });
        }

        merged[collectionName] = Array.from(existingDocsMap.values());
    }

    return merged;
};

const buildAgentRecord = (userDoc) => ({
    agentNumber: userDoc.agentNumber || '0',
    agentCode: userDoc.agentCode,
    userId: userDoc.userId,
    firstName: userDoc.firstName || '',
    lastName: userDoc.lastName || '',
    fullName: `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim(),
    referrerCode: userDoc.pendingReferral?.referrerAgentCode || null,
    referrerId: userDoc.pendingReferral?.referrerId || null,
    type: agentService.determineAgentType(userDoc.agentCode),
    commissionNumbers: agentService.getAgentNumbers(userDoc.agentCode),
    status: 'active'
});

const shouldCreateAgent = (userDoc) => {
    if (!userDoc.agent) {
        return false;
    }

    if (!userDoc.agentCode || userDoc.agentCode === '0' || userDoc.agentCode === 'pending') {
        return false;
    }

    return true;
};

async function migrateUsers() {
    initializeFirebase();
    if (admin.apps.length === 0) {
        console.error('Firebase Admin SDK not initialized. Check FIREBASE_* variables in backend/.env');
        process.exit(1);
    }

    const db = admin.firestore();

    // Fetch associated collections first (indexed by userId)
    const associatedData = await fetchAssociatedCollections(db, verbose);

    const snapshot = await db.collection('users').get();

    if (snapshot.empty) {
        console.log('No users found in Firestore users collection.');
        return;
    }

    const entries = snapshot.docs.map(doc => [doc.id, doc.data()]);
    const batch = limit > 0 ? entries.slice(0, limit) : entries;
    const total = batch.length;

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    console.log(`\nStarting migration for ${total} users${dryRun ? ' (dry run)' : ''}...`);

    for (const [firebaseUserId, rawUser] of batch) {
        try {
            if (!rawUser || typeof rawUser !== 'object') {
                skipped += 1;
                console.log(`Skipping ${firebaseUserId}: invalid user payload`);
                continue;
            }

            // Log user fields if verbose
            if (verbose) {
                logUserFields(firebaseUserId, rawUser);
            }

            const normalized = normalizeUser(rawUser, firebaseUserId);

            // Fetch subcollections for this user
            const userDocRef = db.collection('users').doc(firebaseUserId);
            const subcollections = await fetchSubcollections(db, userDocRef, verbose);

            // Get associated collections for this user
            const associatedDocs = getAssociatedDocsForUser(associatedData, firebaseUserId);

            // Merge associated docs into subcollections
            const allSubcollections = { ...subcollections, ...associatedDocs };

            // Find existing user by userId (doc ID) first, then by email
            const existing = await User.findByUserId(normalized.userId)
                || (normalized.emailAddress ? await User.findByEmail(normalized.emailAddress) : null);

            // Merge subcollections if user exists, otherwise use new subcollections
            if (Object.keys(allSubcollections).length > 0) {
                if (existing && existing.subcollections) {
                    normalized.subcollections = mergeSubcollections(existing.subcollections, allSubcollections);
                    const totalDocs = Object.values(normalized.subcollections).reduce((sum, docs) => sum + docs.length, 0);
                    const newDocs = Object.values(allSubcollections).reduce((sum, docs) => sum + docs.length, 0);
                    console.log(`   📁 Subcollections: ${Object.keys(normalized.subcollections).length} (${totalDocs} total docs, ${newDocs} from Firebase) [MERGED]`);
                } else {
                    normalized.subcollections = allSubcollections;
                    const totalDocs = Object.values(allSubcollections).reduce((sum, docs) => sum + docs.length, 0);
                    const associatedCount = Object.keys(associatedDocs).length;
                    const subcollectionNames = Object.keys(allSubcollections).join(', ');
                    console.log(`   📁 Subcollections: ${Object.keys(allSubcollections).length} (${totalDocs} total docs${associatedCount > 0 ? `, +${associatedCount} associated` : ''}): [${subcollectionNames}]`);
                }
            }

            if (dryRun) {
                if (existing) {
                    updated += 1;
                } else {
                    inserted += 1;
                }
                if (!verbose) {
                    console.log(`[DRY RUN] ${existing ? 'Would update (merge)' : 'Would insert'}: ${firebaseUserId} (email: ${normalized.emailAddress || 'none'})`);
                } else {
                    console.log(`   ✅ [DRY RUN] ${existing ? 'Would update (merge)' : 'Would insert'}`);
                }
                continue;
            }

            const now = new Date();
            const updatePayload = {
                ...normalized,
                updatedAt: now
            };

            delete updatePayload.password;

            if (existing) {
                await User.updateById(existing.id, updatePayload);
                updated += 1;
            } else {
                // Use firebaseUserId as document ID
                await User.create({
                    ...updatePayload,
                    createdAt: updatePayload.createdAt || now
                });
                inserted += 1;
            }

            if (!skipAgents && shouldCreateAgent(updatePayload)) {
                const existingAgent = await Agent.findByCode(updatePayload.agentCode);
                if (!existingAgent) {
                    await Agent.create(buildAgentRecord(updatePayload));
                }
            }
        } catch (error) {
            errors += 1;
            console.error(`Failed to migrate ${firebaseUserId}:`, error.message);
        }
    }

    console.log('Migration finished.');
    console.log(`Inserted: ${inserted}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
}

migrateUsers()
    .catch((error) => {
        console.error('Migration failed:', error.message);
        process.exitCode = 1;
    });
