const admin = require('firebase-admin');

/**
 * Get admin history logs with pagination and filtering
 * @route GET /api/admin-logs
 */
const getAdminLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      adminEmail = '',
      action = '',
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    console.log('[ADMIN LOGS] Fetching admin logs', {
      page: pageNum,
      limit: limitNum,
      search,
      adminEmail,
      action
    });

    // Query all admin_history_logs from all users using collectionGroup
    let query = admin.firestore().collectionGroup('admin_history_logs');

    // Only apply server-side filters if no action filter (to avoid index requirement)
    // When action filter is present, we'll filter client-side
    const useClientSideFiltering = action || adminEmail;

    if (!useClientSideFiltering) {
      // Apply sorting only when no filters (no index needed)
      const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
      query = query.orderBy(sortBy, sortDirection);
    } else {
      // Just sort by timestamp for client-side filtering
      query = query.orderBy('timestamp', 'desc');
    }

    // Get all matching documents
    const snapshot = await query.get();

    console.log('[ADMIN LOGS] Snapshot size:', snapshot.size);
    console.log('[ADMIN LOGS] Snapshot empty:', snapshot.empty);

    // Helper function to infer resource type from action or data
    const inferResourceType = (data) => {
      const action = (data.action || '').toLowerCase();
      const details = (data.details || '').toLowerCase();
      
      if (action.includes('kyc') || details.includes('kyc')) return 'KYC';
      if (action.includes('deposit') || details.includes('deposit')) return 'DEPOSIT';
      if (action.includes('withdraw') || details.includes('withdraw')) return 'WITHDRAWAL';
      if (action.includes('user') || details.includes('user') || data.targetUserId) return 'USER';
      if (action.includes('agent') || details.includes('agent')) return 'AGENT';
      if (action.includes('transaction') || details.includes('transaction')) return 'TRANSACTION';
      if (action.includes('notification') || details.includes('notification')) return 'NOTIFICATION';
      if (action.includes('settings') || details.includes('settings')) return 'SETTINGS';
      if (action.includes('profile') || details.includes('profile')) return 'PROFILE';
      
      return 'SYSTEM';
    };

    let logs = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || null,
        // Map Firebase fields to frontend expected fields
        adminName: data.adminDisplayName || data.adminName || 'Unknown Admin',
        adminEmail: data.adminEmail || '',
        action: data.action || '',
        actionLabel: data.action || data.details || 'Unknown Action',
        resourceType: data.resourceType || inferResourceType(data),
        resourceId: data.targetUserId || data.resourceId || '',
        ipAddress: data.ipAddress || 'N/A',
        userAgent: data.userAgent || 'N/A',
        createdAt: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
        metadata: {
          targetUserName: data.targetUserName,
          targetUserId: data.targetUserId,
          details: data.details,
          ...data
        }
      };
    });

    // Filter out rejected and approved actions
    logs = logs.filter(log => {
      const actionLower = (log.action || '').toLowerCase();
      return !actionLower.includes('rejected') && !actionLower.includes('approved');
    });

    // Apply search filter (client-side since Firestore doesn't support full-text search)
    if (search) {
      const searchLower = search.toLowerCase();
      logs = logs.filter(log => {
        return (
          (log.adminDisplayName && log.adminDisplayName.toLowerCase().includes(searchLower)) ||
          (log.adminEmail && log.adminEmail.toLowerCase().includes(searchLower)) ||
          (log.action && log.action.toLowerCase().includes(searchLower)) ||
          (log.targetUserName && log.targetUserName.toLowerCase().includes(searchLower)) ||
          (log.targetUserId && log.targetUserId.toLowerCase().includes(searchLower)) ||
          (log.details && typeof log.details === 'string' && log.details.toLowerCase().includes(searchLower))
        );
      });
    }

    // Apply client-side filters for action and adminEmail
    if (action) {
      const actionLower = action.toLowerCase();
      logs = logs.filter(log => {
        const logAction = (log.action || '').toLowerCase();
        return logAction.includes(actionLower);
      });
    }

    if (adminEmail) {
      logs = logs.filter(log => log.adminEmail === adminEmail);
    }

    const total = logs.length;

    // Apply pagination
    const paginatedLogs = logs.slice(offset, offset + limitNum);

    console.log('[ADMIN LOGS] Successfully fetched admin logs', {
      total,
      returned: paginatedLogs.length
    });

    res.json({
      success: true,
      data: {
        logs: paginatedLogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('[ADMIN LOGS] Error fetching admin logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin logs',
      message: error.message
    });
  }
};

/**
 * Get a single admin log by ID
 * @route GET /api/admin-logs/:id
 */
const getAdminLogById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('[ADMIN LOGS] Fetching admin log by ID', { id });

    // Search through all admin_history_logs collections
    const query = admin.firestore().collectionGroup('admin_history_logs').where(admin.firestore.FieldPath.documentId(), '==', id);
    const snapshot = await query.get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'Admin log not found'
      });
    }

    const doc = snapshot.docs[0];
    const log = {
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || null
    };

    console.log('[ADMIN LOGS] Successfully fetched admin log', { id });

    res.json({
      success: true,
      data: log
    });

  } catch (error) {
    console.error('[ADMIN LOGS] Error fetching admin log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin log',
      message: error.message
    });
  }
};

/**
 * Get unique admin emails for filtering
 * @route GET /api/admin-logs/admins
 */
const getAdminEmails = async (req, res) => {
  try {
    console.log('[ADMIN LOGS] Fetching unique admin emails');

    const query = admin.firestore().collectionGroup('admin_history_logs');
    const snapshot = await query.get();

    const adminEmails = new Set();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.adminEmail) {
        adminEmails.add(data.adminEmail);
      }
    });

    const admins = Array.from(adminEmails).map(email => ({
      email,
      displayName: email.split('@')[0] // Simple display name from email
    }));

    console.log('[ADMIN LOGS] Successfully fetched admin emails', { count: admins.length });

    res.json({
      success: true,
      data: admins
    });

  } catch (error) {
    console.error('[ADMIN LOGS] Error fetching admin emails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin emails',
      message: error.message
    });
  }
};

/**
 * Get unique actions for filtering
 * @route GET /api/admin-logs/actions
 */
const getActions = async (req, res) => {
  try {
    console.log('[ADMIN LOGS] Fetching unique actions');

    const query = admin.firestore().collectionGroup('admin_history_logs');
    const snapshot = await query.get();

    const actions = new Set();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.action) {
        actions.add(data.action);
      }
    });

    const actionsList = Array.from(actions).sort();

    console.log('[ADMIN LOGS] Successfully fetched actions', { count: actionsList.length });

    res.json({
      success: true,
      data: actionsList
    });

  } catch (error) {
    console.error('[ADMIN LOGS] Error fetching actions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch actions',
      message: error.message
    });
  }
};

module.exports = {
  getAdminLogs,
  getAdminLogById,
  getAdminEmails,
  getActions
};
