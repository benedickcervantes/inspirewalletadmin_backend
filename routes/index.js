const express = require('express');
const router = express.Router();

/**
 * Main routes index
 * Add your route modules here as you create them
 */

// Import route modules
const agentRoutes = require('./agentRoutes');
const authRoutes = require('./authRoutes');
const adminAuthRoutes = require('./adminAuthRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const migrationRoutes = require('./migrationRoutes');
const userRoutes = require('./userRoutes');
const subcollectionRoutes = require('./subcollectionRoutes');
const firebaseCollectionRoutes = require('./firebaseCollectionRoutes');
const firebaseUserRoutes = require('./firebaseUserRoutes');
const firebaseDepositRequestRoutes = require('./firebaseDepositRequestRoutes');
const adminLogsRoutes = require('./adminLogs');
const taskWithdrawalsRoutes = require('./taskWithdrawals');
const timeDepositRoutes = require('./timeDepositRoutes');
const investmentRatesRoutes = require('./investmentRatesRoutes');

// Health check route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString()
  });
});

// Auth routes
router.use('/auth', authRoutes);

// Admin Auth routes (Firestore adminUsers collection)
router.use('/admin-auth', adminAuthRoutes);

// Dashboard routes
router.use('/dashboard', dashboardRoutes);

// Migration routes
router.use('/migration', migrationRoutes);

// Agent routes
router.use('/agents', agentRoutes);

// User routes
router.use('/users', userRoutes);

// Subcollection routes (bank applications, deposit requests, etc.)
router.use('/subcollections', subcollectionRoutes);

// Firebase user routes (direct Firestore /users)
router.use('/firebase-users', firebaseUserRoutes);

// Firebase deposit request routes (Firestore /users/{uid}/depositRequest)
router.use('/firebase-deposit-requests', firebaseDepositRequestRoutes);

// Firebase collection routes (mirrored root collections)
router.use('/firebase-collections', firebaseCollectionRoutes);

// Admin logs routes (admin_history_logs collection group)
router.use('/admin-logs', adminLogsRoutes);

// Task withdrawals routes (taskWithdrawRequest collection)
router.use('/task-withdrawals', taskWithdrawalsRoutes);

// Time deposit routes (quote + shared admin-only helpers)
router.use('/time-deposits', timeDepositRoutes);

// Investment rates routes (manage rate tiers in Firestore)
router.use('/investment-rates', investmentRatesRoutes);

module.exports = router;

