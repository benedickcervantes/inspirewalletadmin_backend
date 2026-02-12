const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// Maintenance mode routes
router.get('/maintenance', settingsController.getMaintenanceMode);
router.put('/maintenance', settingsController.updateMaintenanceMode);

// App settings routes
router.get('/app-settings', settingsController.getAppSettings);
router.put('/app-settings', settingsController.updateAppSettings);

// Events routes
router.get('/events/latest', settingsController.getLatestEvent);
router.post('/events', settingsController.postEvent);
router.put('/events/:eventId/status', settingsController.updateEventStatus);

// Push notifications route
router.post('/push-notifications', settingsController.sendPushNotification);

module.exports = router;
