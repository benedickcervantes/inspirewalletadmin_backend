const { getFirestore } = require('../config/firebase');

/**
 * BaseModel - Abstract base class for all Firestore models
 * Provides common CRUD operations and utility methods
 *
 * @abstract
 * @class BaseModel
 */
class BaseModel {
    /**
     * Create a new BaseModel instance
     * @param {string} collectionName - The Firestore collection name
     */
    constructor(collectionName) {
        if (this.constructor === BaseModel) {
            throw new Error('BaseModel is an abstract class and cannot be instantiated directly');
        }

        if (!collectionName) {
            throw new Error('Collection name is required');
        }

        this.collectionName = collectionName;
    }

    /**
     * Get the Firestore collection reference
     * @returns {FirebaseFirestore.CollectionReference} Firestore collection
     */
    getCollection() {
        return getFirestore().collection(this.collectionName);
    }

    /**
     * Convert a Firestore document snapshot to a plain object
     * @param {FirebaseFirestore.DocumentSnapshot} doc - Firestore document snapshot
     * @returns {Object|null} Plain object with id field, or null if doc doesn't exist
     */
    _docToObject(doc) {
        if (!doc.exists) return null;
        const data = doc.data();
        // Convert Firestore Timestamps to JS Dates
        const converted = {};
        for (const [key, value] of Object.entries(data)) {
            if (value && typeof value.toDate === 'function') {
                converted[key] = value.toDate();
            } else {
                converted[key] = value;
            }
        }
        return { id: doc.id, ...converted };
    }

    /**
     * Build a Firestore query from a simple query object
     * Supports:
     *   - Simple equality: { field: value }
     *   - Comparison operators: { field: { $gt: v, $gte: v, $lt: v, $lte: v } }
     *   - Null checks: { field: null }
     *
     * Does NOT support $or, $regex, or nested operators.
     * @param {Object} query - Simple query object
     * @returns {FirebaseFirestore.Query} Firestore query
     */
    _buildQuery(query) {
        let ref = this.getCollection();

        for (const [field, value] of Object.entries(query)) {
            if (field.startsWith('$')) continue; // skip top-level operators like $or

            if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                // Check for comparison operators
                const ops = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' };
                for (const [op, firestoreOp] of Object.entries(ops)) {
                    if (value[op] !== undefined) {
                        ref = ref.where(field, firestoreOp, value[op]);
                    }
                }
            } else {
                ref = ref.where(field, '==', value);
            }
        }

        return ref;
    }

    /**
     * Find a document by its Firestore document ID
     * @param {string} id - The document ID
     * @returns {Promise<Object|null>} The document or null
     */
    async findById(id) {
        try {
            const doc = await this.getCollection().doc(id).get();
            return this._docToObject(doc);
        } catch (error) {
            console.error(`Error finding ${this.collectionName} by ID:`, error);
            throw error;
        }
    }

    /**
     * Find a single document matching the query
     * @param {Object} query - Query object
     * @returns {Promise<Object|null>} The document or null
     */
    async findOne(query) {
        try {
            const firestoreQuery = this._buildQuery(query);
            const snapshot = await firestoreQuery.limit(1).get();

            if (snapshot.empty) return null;
            return this._docToObject(snapshot.docs[0]);
        } catch (error) {
            console.error(`Error finding ${this.collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Find all documents matching the query
     * @param {Object} query - Query object
     * @param {Object} options - Query options (sort, limit, skip)
     * @returns {Promise<Array>} Array of documents
     */
    async findMany(query = {}, options = {}) {
        try {
            let firestoreQuery = this._buildQuery(query);

            if (options.sort) {
                for (const [field, direction] of Object.entries(options.sort)) {
                    firestoreQuery = firestoreQuery.orderBy(field, direction === -1 ? 'desc' : 'asc');
                }
            }

            if (options.skip) {
                firestoreQuery = firestoreQuery.offset(options.skip);
            }

            if (options.limit) {
                firestoreQuery = firestoreQuery.limit(options.limit);
            }

            const snapshot = await firestoreQuery.get();
            return snapshot.docs.map(doc => this._docToObject(doc));
        } catch (error) {
            console.error(`Error finding ${this.collectionName} documents:`, error);
            throw error;
        }
    }

    /**
     * Insert a new document (auto-generated ID)
     * @param {Object} data - Document data
     * @returns {Promise<Object>} The inserted document with id
     */
    async insertOne(data) {
        try {
            const doc = {
                ...data,
                createdAt: data.createdAt || new Date(),
                updatedAt: new Date()
            };

            const docRef = await this.getCollection().add(doc);
            return {
                id: docRef.id,
                ...doc
            };
        } catch (error) {
            console.error(`Error inserting ${this.collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Insert a document with a specific ID
     * @param {string} docId - The document ID to use
     * @param {Object} data - Document data
     * @returns {Promise<Object>} The inserted document with id
     */
    async insertWithId(docId, data) {
        try {
            const doc = {
                ...data,
                createdAt: data.createdAt || new Date(),
                updatedAt: new Date()
            };

            await this.getCollection().doc(docId).set(doc);
            return {
                id: docId,
                ...doc
            };
        } catch (error) {
            console.error(`Error inserting ${this.collectionName} with ID:`, error);
            throw error;
        }
    }

    /**
     * Update a document by ID
     * @param {string} id - The document ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<boolean>} Whether the update was successful
     */
    async updateById(id, updateData) {
        try {
            const docRef = this.getCollection().doc(id);
            const doc = await docRef.get();
            if (!doc.exists) return false;

            await docRef.update({
                ...updateData,
                updatedAt: new Date()
            });
            return true;
        } catch (error) {
            console.error(`Error updating ${this.collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Update a single document matching the query
     * @param {Object} query - Query object
     * @param {Object} updateData - Data to update
     * @returns {Promise<boolean>} Whether the update was successful
     */
    async updateOne(query, updateData) {
        try {
            const firestoreQuery = this._buildQuery(query);
            const snapshot = await firestoreQuery.limit(1).get();

            if (snapshot.empty) return false;

            const docRef = snapshot.docs[0].ref;
            await docRef.update({
                ...updateData,
                updatedAt: new Date()
            });
            return true;
        } catch (error) {
            console.error(`Error updating ${this.collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Update multiple documents matching the query
     * @param {Object} query - Query object
     * @param {Object} updateData - Data to update
     * @returns {Promise<number>} Number of documents updated
     */
    async updateMany(query, updateData) {
        try {
            const firestoreQuery = this._buildQuery(query);
            const snapshot = await firestoreQuery.get();

            if (snapshot.empty) return 0;

            const db = getFirestore();
            const batch = db.batch();
            const updatePayload = { ...updateData, updatedAt: new Date() };

            for (const doc of snapshot.docs) {
                batch.update(doc.ref, updatePayload);
            }

            await batch.commit();
            return snapshot.size;
        } catch (error) {
            console.error(`Error updating ${this.collectionName} documents:`, error);
            throw error;
        }
    }

    /**
     * Delete a document by ID
     * @param {string} id - The document ID
     * @returns {Promise<boolean>} Whether the deletion was successful
     */
    async deleteById(id) {
        try {
            const docRef = this.getCollection().doc(id);
            const doc = await docRef.get();
            if (!doc.exists) return false;

            await docRef.delete();
            return true;
        } catch (error) {
            console.error(`Error deleting ${this.collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Delete a single document matching the query
     * @param {Object} query - Query object
     * @returns {Promise<boolean>} Whether the deletion was successful
     */
    async deleteOne(query) {
        try {
            const firestoreQuery = this._buildQuery(query);
            const snapshot = await firestoreQuery.limit(1).get();

            if (snapshot.empty) return false;

            await snapshot.docs[0].ref.delete();
            return true;
        } catch (error) {
            console.error(`Error deleting ${this.collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Count documents matching the query
     * @param {Object} query - Query object
     * @returns {Promise<number>} Document count
     */
    async count(query = {}) {
        try {
            const firestoreQuery = this._buildQuery(query);
            const snapshot = await firestoreQuery.count().get();
            return snapshot.data().count;
        } catch (error) {
            console.error(`Error counting ${this.collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Check if a document exists matching the query
     * @param {Object} query - Query object
     * @returns {Promise<boolean>} Whether a matching document exists
     */
    async exists(query) {
        try {
            const firestoreQuery = this._buildQuery(query);
            const snapshot = await firestoreQuery.limit(1).get();
            return !snapshot.empty;
        } catch (error) {
            console.error(`Error checking ${this.collectionName} existence:`, error);
            throw error;
        }
    }
}

module.exports = BaseModel;
