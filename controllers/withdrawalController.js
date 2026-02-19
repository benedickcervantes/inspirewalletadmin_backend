const admin = require('firebase-admin');

/**
 * Get withdrawal requests with pagination and filtering
 * @route GET /api/withdrawals
 */
const getWithdrawals = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      status = 'all',
      sortBy = 'requestDate',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    console.log('[WITHDRAWALS] Fetching withdrawal requests', {
      page: pageNum,
      limit: limitNum,
      search,
      status
    });

    // Query withdrawRequests collection (top-level)
    let query = admin.firestore().collection('withdrawRequests');

    // Apply sorting
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    query = query.orderBy(sortBy, sortDirection);

    // Get all documents from top-level collection
    const snapshot = await query.get();

    console.log('[WITHDRAWALS] Top-level snapshot size:', snapshot.size);

    let withdrawals = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        requestDate: data.requestDate?.toDate?.()?.toISOString() || null,
        submittedAt: data.submittedAt?.toDate?.()?.toISOString() || null,
        processedAt: data.processedAt?.toDate?.()?.toISOString() || null,
        approvedAt: data.approvedAt?.toDate?.()?.toISOString() || null,
        source: 'top-level'
      };
    });

    // Also fetch from user subcollections
    const usersSnapshot = await admin.firestore().collection('users').get();
    
    for (const userDoc of usersSnapshot.docs) {
      const userWithdrawalsSnapshot = await admin.firestore()
        .collection('users')
        .doc(userDoc.id)
        .collection('withdrawals')
        .get();
      
      userWithdrawalsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        withdrawals.push({
          id: doc.id,
          ...data,
          requestDate: data.submittedAt?.toDate?.()?.toISOString() || data.requestDate?.toDate?.()?.toISOString() || null,
          submittedAt: data.submittedAt?.toDate?.()?.toISOString() || null,
          processedAt: data.processedAt?.toDate?.()?.toISOString() || null,
          approvedAt: data.approvedAt?.toDate?.()?.toISOString() || null,
          source: 'user-subcollection',
          userId: userDoc.id
        });
      });
    }

    // Apply status filter
    if (status !== 'all') {
      withdrawals = withdrawals.filter(w => w.status?.toLowerCase() === status.toLowerCase());
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      withdrawals = withdrawals.filter(w => {
        return (
          (w.userEmail && w.userEmail.toLowerCase().includes(searchLower)) ||
          (w.userName && w.userName.toLowerCase().includes(searchLower)) ||
          (w.emailAddress && w.emailAddress.toLowerCase().includes(searchLower)) ||
          (w.bankAccountNumber && w.bankAccountNumber.includes(searchLower)) ||
          (w.walletNumber && w.walletNumber.includes(searchLower)) ||
          (w.userId && w.userId.toLowerCase().includes(searchLower))
        );
      });
    }

    // Sort by date
    withdrawals.sort((a, b) => {
      const dateA = new Date(a.requestDate || a.submittedAt || 0);
      const dateB = new Date(b.requestDate || b.submittedAt || 0);
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    const total = withdrawals.length;

    // Apply pagination
    const paginatedWithdrawals = withdrawals.slice(offset, offset + limitNum);

    // Calculate statistics
    const stats = {
      total: withdrawals.length,
      pending: withdrawals.filter(w => w.status?.toLowerCase() === 'pending').length,
      approved: withdrawals.filter(w => w.status?.toLowerCase() === 'approved').length,
      rejected: withdrawals.filter(w => w.status?.toLowerCase() === 'rejected').length,
      totalAmount: withdrawals
        .filter(w => w.status?.toLowerCase() === 'approved')
        .reduce((sum, w) => sum + (w.amount || 0), 0)
    };

    console.log('[WITHDRAWALS] Successfully fetched withdrawals', {
      total,
      returned: paginatedWithdrawals.length,
      stats
    });

    res.json({
      success: true,
      data: {
        withdrawals: paginatedWithdrawals,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        },
        stats
      }
    });

  } catch (error) {
    console.error('[WITHDRAWALS] Error fetching withdrawals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch withdrawals',
      message: error.message
    });
  }
};

/**
 * Update withdrawal status (approve/reject)
 * @route PUT /api/withdrawals/:id/status
 */
const updateWithdrawalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const adminEmail = req.user?.email || 'unknown';

    console.log('[WITHDRAWALS] Updating withdrawal status', {
      id,
      status,
      adminEmail,
      rejectionReason
    });

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be "approved" or "rejected"'
      });
    }

    // Try to find in top-level collection first
    let requestRef = admin.firestore().collection('withdrawRequests').doc(id);
    let requestDoc = await requestRef.get();
    let source = 'top-level';
    let userId = null;

    // If not found in top-level, search in user subcollections
    if (!requestDoc.exists) {
      const usersSnapshot = await admin.firestore().collection('users').get();
      
      for (const userDoc of usersSnapshot.docs) {
        const withdrawalDoc = await admin.firestore()
          .collection('users')
          .doc(userDoc.id)
          .collection('withdrawals')
          .doc(id)
          .get();
        
        if (withdrawalDoc.exists) {
          requestRef = withdrawalDoc.ref;
          requestDoc = withdrawalDoc;
          source = 'user-subcollection';
          userId = userDoc.id;
          break;
        }
      }
    }

    if (!requestDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal request not found'
      });
    }

    const requestData = requestDoc.data();
    userId = userId || requestData.userId;

    // Update the withdrawal request status
    const updateData = {
      status: status,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedBy: adminEmail,
      approvedBy: adminEmail,
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (status === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    await requestRef.update(updateData);

    console.log('[WITHDRAWALS] Withdrawal status updated successfully');

    res.json({
      success: true,
      message: `Withdrawal request ${status} successfully`,
      data: {
        id,
        status,
        processedBy: adminEmail,
        processedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[WITHDRAWALS] Error updating withdrawal status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update withdrawal status',
      message: error.message
    });
  }
};

/**
 * Get a single withdrawal by ID
 * @route GET /api/withdrawals/:id
 */
const getWithdrawalById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('[WITHDRAWALS] Fetching withdrawal by ID', { id });

    // Try top-level collection first
    let docRef = admin.firestore().collection('withdrawRequests').doc(id);
    let doc = await docRef.get();
    let source = 'top-level';

    // If not found, search in user subcollections
    if (!doc.exists) {
      const usersSnapshot = await admin.firestore().collection('users').get();
      
      for (const userDoc of usersSnapshot.docs) {
        const withdrawalDoc = await admin.firestore()
          .collection('users')
          .doc(userDoc.id)
          .collection('withdrawals')
          .doc(id)
          .get();
        
        if (withdrawalDoc.exists) {
          doc = withdrawalDoc;
          source = 'user-subcollection';
          break;
        }
      }
    }

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal request not found'
      });
    }

    const data = doc.data();
    const withdrawal = {
      id: doc.id,
      ...data,
      requestDate: data.requestDate?.toDate?.()?.toISOString() || null,
      submittedAt: data.submittedAt?.toDate?.()?.toISOString() || null,
      processedAt: data.processedAt?.toDate?.()?.toISOString() || null,
      approvedAt: data.approvedAt?.toDate?.()?.toISOString() || null,
      source
    };

    console.log('[WITHDRAWALS] Successfully fetched withdrawal', { id });

    res.json({
      success: true,
      data: withdrawal
    });

  } catch (error) {
    console.error('[WITHDRAWALS] Error fetching withdrawal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch withdrawal',
      message: error.message
    });
  }
};

module.exports = {
  getWithdrawals,
  updateWithdrawalStatus,
  getWithdrawalById
};
