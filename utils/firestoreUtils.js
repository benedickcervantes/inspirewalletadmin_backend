const { admin } = require('../config/firebase');

const firestoreTypes = {
    Timestamp: admin.firestore.Timestamp,
    GeoPoint: admin.firestore.GeoPoint,
    DocumentReference: admin.firestore.DocumentReference
};

const getTimestampMs = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') {
        return Number.isNaN(value) ? null : value;
    }
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    if (typeof value === 'object') {
        if (typeof value.toDate === 'function') {
            const date = value.toDate();
            return date instanceof Date ? date.getTime() : null;
        }
        const record = value;
        const seconds = record._seconds ?? record.seconds;
        const nanos = record._nanoseconds ?? record.nanoseconds;
        if (typeof seconds === 'number') {
            const extraMs = typeof nanos === 'number' ? Math.floor(nanos / 1_000_000) : 0;
            return seconds * 1000 + extraMs;
        }
    }
    return null;
};

const serializeFirestoreValue = (value) => {
    if (value instanceof Date) {
        return value;
    }

    if (firestoreTypes.Timestamp && value instanceof firestoreTypes.Timestamp) {
        return value.toDate();
    }

    if (firestoreTypes.GeoPoint && value instanceof firestoreTypes.GeoPoint) {
        return {
            latitude: value.latitude,
            longitude: value.longitude
        };
    }

    if (firestoreTypes.DocumentReference && value instanceof firestoreTypes.DocumentReference) {
        return value.path;
    }

    if (Array.isArray(value)) {
        return value.map(serializeFirestoreValue);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, childValue]) => [key, serializeFirestoreValue(childValue)])
        );
    }

    return value;
};

const sanitizeFirestoreData = (data) => {
    const serialized = serializeFirestoreValue(data);
    if (!serialized || typeof serialized !== 'object' || Array.isArray(serialized)) {
        return serialized;
    }

    const cleaned = { ...serialized };
    delete cleaned.password;
    delete cleaned.passcode;
    return cleaned;
};

module.exports = {
    getTimestampMs,
    serializeFirestoreValue,
    sanitizeFirestoreData
};
