const { getFirestore } = require('../config/firebase');

const ADMIN_COLLECTION = 'adminUsers';

const normalizeEmail = (value) =>
    typeof value === 'string' ? value.trim().toLowerCase() : '';

const hasAdminPrivileges = (adminData = {}, tokenRole = '') => {
    const role = typeof adminData.role === 'string' ? adminData.role.toLowerCase() : '';
    const specialRole = typeof adminData.specialrole === 'string' ? adminData.specialrole.toLowerCase() : '';
    const normalizedTokenRole = typeof tokenRole === 'string' ? tokenRole.toLowerCase() : '';

    return role === 'admin' || role === 'superadmin' || specialRole === 'superadmin' || normalizedTokenRole === 'admin' || normalizedTokenRole === 'superadmin';
};

const resolveAdminByEmail = async (db, email) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        return null;
    }

    const snapshot = await db
        .collection(ADMIN_COLLECTION)
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const adminDoc = snapshot.docs[0];
    return {
        id: adminDoc.id,
        ...adminDoc.data()
    };
};

const requireAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const db = getFirestore();
        const tokenAdminId = typeof req.user.adminId === 'string' && req.user.adminId.trim()
            ? req.user.adminId.trim()
            : '';

        let adminData = null;

        if (tokenAdminId) {
            const adminDoc = await db.collection(ADMIN_COLLECTION).doc(tokenAdminId).get();
            if (adminDoc.exists) {
                adminData = {
                    id: adminDoc.id,
                    ...adminDoc.data()
                };
            }
        }

        if (!adminData) {
            adminData = await resolveAdminByEmail(db, req.user.email);
        }

        if (!adminData) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        if (!hasAdminPrivileges(adminData, req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient admin privileges'
            });
        }

        req.adminId = adminData.id;
        req.admin = {
            id: adminData.id,
            email: adminData.email,
            displayName: adminData.name || req.user.name || req.user.email || adminData.id,
            role: adminData.role || req.user.role || 'admin',
            specialrole: adminData.specialrole
        };

        return next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Failed to verify admin access',
            message: error.message
        });
    }
};

module.exports = {
    requireAdmin
};