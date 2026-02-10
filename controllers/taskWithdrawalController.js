const admin = require('firebase-admin');

/**
 * Get task withdrawal requests with pagination and filtering
 * @route GET /api/task-withdrawals
 */
const getTaskWithdrawals = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      status = 'all',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    console.log('[TASK WITHDRAWALS] Fetching task withdrawal requests', {
      page: pageNum,
      limit: limitNum,
      search,
      status
    });

    // Query taskWithdrawRequest collection
    let query = admin.firestore().collection('taskWithdrawRequest');

    // Apply sorting
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    query = query.orderBy(sortBy, sortDirection);

    // Get all documents
    const snapshot = await query.get();

    console.log('[TASK WITHDRAWALS] Snapshot size:', snapshot.size);

    let withdrawals = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        processedAt: data.processedAt?.toDate?.()?.toISOString() || null,
      };
    });

    // Apply status filter
    if (status !== 'all') {
      withdrawals = withdrawals.filter(w => w.status === status);
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      withdrawals = withdrawals.filter(w => {
        return (
          (w.userEmail && w.userEmail.toLowerCase().includes(searchLower)) ||
          (w.userName && w.userName.toLowerCase().includes(searchLower)) ||
          (w.mobileNumber && w.mobileNumber.includes(searchLower)) ||
          (w.userId && w.userId.toLowerCase().includes(searchLower))
        );
      });
    }

    const total = withdrawals.length;

    // Apply pagination
    const paginatedWithdrawals = withdrawals.slice(offset, offset + limitNum);

    // Calculate statistics
    const stats = {
      total: withdrawals.length,
      pending: withdrawals.filter(w => w.status === 'pending').length,
      approved: withdrawals.filter(w => w.status === 'approved').length,
      rejected: withdrawals.filter(w => w.status === 'rejected').length,
      totalAmount: withdrawals
        .filter(w => w.status === 'approved')
        .reduce((sum, w) => sum + (w.amount || 0), 0)
    };

    console.log('[TASK WITHDRAWALS] Successfully fetched task withdrawals', {
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
    console.error('[TASK WITHDRAWALS] Error fetching task withdrawals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch task withdrawals',
      message: error.message
    });
  }
};

/**
 * Update task withdrawal status (approve/reject)
 * @route PUT /api/task-withdrawals/:id/status
 */
const updateWithdrawalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminEmail = req.user?.email || 'unknown';

    console.log('[TASK WITHDRAWALS] Updating withdrawal status', {
      id,
      status,
      adminEmail
    });

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be "approved" or "rejected"'
      });
    }

    const requestRef = admin.firestore().collection('taskWithdrawRequest').doc(id);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal request not found'
      });
    }

    const requestData = requestDoc.data();

    // If REJECTED: Return accumulatedPoints to user
    if (status === 'rejected') {
      console.log('[TASK WITHDRAWALS] Processing rejection, returning points');
      const userRef = admin.firestore().collection('users').doc(requestData.userId);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        const currentPoints = userData.accumulatedPoints || 0;
        const pointsToReturn = requestData.amount || 0;

        console.log(`[TASK WITHDRAWALS] User current points: ${currentPoints}, returning: ${pointsToReturn}`);

        // Return the points
        const newBalance = currentPoints + pointsToReturn;
        await userRef.update({
          accumulatedPoints: newBalance
        });

        console.log(`[TASK WITHDRAWALS] Updated user balance to: ${newBalance}`);

        // Add point transaction record
        const pointTransactionsRef = userRef.collection('pointsTransactions');
        await pointTransactionsRef.add({
          amount: pointsToReturn,
          balanceAfter: newBalance,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          description: `Withdrawal request rejected - ${pointsToReturn} points returned`,
          type: "withdrawal_rejected"
        });

        console.log('[TASK WITHDRAWALS] Point transaction created');
      }
    }

    // Update the withdrawal request status
    await requestRef.update({
      status: status,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedBy: adminEmail
    });

    // Add notification to user's notifications collection
    const notificationData = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      message: status === 'approved'
        ? `Your withdrawal request for ${requestData.amount} points to ${requestData.paymentMethod} has been approved`
        : `Your withdrawal request for ${requestData.amount} points to ${requestData.paymentMethod} has been rejected. Your ${requestData.amount} points have been returned to your account.`,
      points: requestData.amount,
      read: false,
      requestId: id,
      title: status === 'approved' ? "Withdrawal Request Approved" : "Withdrawal Request Rejected",
      type: status === 'approved' ? "points_withdrawal" : "points_withdrawal_rejected"
    };

    const notificationsRef = admin.firestore()
      .collection('users')
      .doc(requestData.userId)
      .collection('notifications');
    
    await notificationsRef.add(notificationData);

    console.log('[TASK WITHDRAWALS] Notification saved');

    // Send push notification
    try {
      const notificationTitle = status === 'approved'
        ? '🎉 Task Points Withdrawal Approved!'
        : '❌ Task Points Withdrawal Rejected';
      
      const notificationMessage = status === 'approved'
        ? `Your withdrawal of ₱${requestData.amount} has been approved and processed successfully.`
        : `Your withdrawal request of ₱${requestData.amount} has been rejected. ${requestData.amount} points have been returned to your account.`;

      const pushResponse = await fetch('https://app.nativenotify.com/api/indie/notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subID: requestData.userId,
          appId: 28259,
          appToken: "QAg2EVLUAIEiCtThmFoSv2",
          title: notificationTitle,
          message: notificationMessage,
        }),
      });

      if (pushResponse.ok) {
        console.log('[TASK WITHDRAWALS] Push notification sent');
      } else {
        console.warn('[TASK WITHDRAWALS] Push notification failed, but continuing');
      }
    } catch (pushError) {
      console.error('[TASK WITHDRAWALS] Error sending push notification:', pushError);
      // Don't fail the whole operation if notification fails
    }

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
    console.error('[TASK WITHDRAWALS] Error updating withdrawal status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update withdrawal status',
      message: error.message
    });
  }
};

/**
 * Get a single task withdrawal by ID
 * @route GET /api/task-withdrawals/:id
 */
const getTaskWithdrawalById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('[TASK WITHDRAWALS] Fetching task withdrawal by ID', { id });

    const docRef = admin.firestore().collection('taskWithdrawRequest').doc(id);
    const doc = await docRef.get();

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
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      processedAt: data.processedAt?.toDate?.()?.toISOString() || null,
    };

    console.log('[TASK WITHDRAWALS] Successfully fetched task withdrawal', { id });

    res.json({
      success: true,
      data: withdrawal
    });

  } catch (error) {
    console.error('[TASK WITHDRAWALS] Error fetching task withdrawal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch task withdrawal',
      message: error.message
    });
  }
};

module.exports = {
  getTaskWithdrawals,
  updateWithdrawalStatus,
  getTaskWithdrawalById
};
