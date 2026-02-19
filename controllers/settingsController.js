const admin = require('firebase-admin');

class SettingsController {
    constructor() {
        this.getMaintenanceMode = this.getMaintenanceMode.bind(this);
        this.updateMaintenanceMode = this.updateMaintenanceMode.bind(this);
        this.getAppSettings = this.getAppSettings.bind(this);
        this.updateAppSettings = this.updateAppSettings.bind(this);
        this.getLatestEvent = this.getLatestEvent.bind(this);
        this.postEvent = this.postEvent.bind(this);
        this.updateEventStatus = this.updateEventStatus.bind(this);
        this.sendPushNotification = this.sendPushNotification.bind(this);
    }

    /**
     * Get maintenance mode status
     */
    async getMaintenanceMode(req, res) {
        try {
            const maintenanceRef = admin.firestore().collection('appConfig').doc('maintenance');
            const maintenanceDoc = await maintenanceRef.get();

            if (maintenanceDoc.exists) {
                res.json({
                    success: true,
                    data: maintenanceDoc.data()
                });
            } else {
                res.json({
                    success: true,
                    data: {
                        isEnabled: false,
                        message: 'We are currently performing maintenance. Please check back later.'
                    }
                });
            }
        } catch (error) {
            console.error('[SETTINGS] Error fetching maintenance mode:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch maintenance mode'
            });
        }
    }

    /**
     * Update maintenance mode
     */
    async updateMaintenanceMode(req, res) {
        try {
            const { isEnabled, message } = req.body;
            const adminEmail = req.user?.email || 'unknown';

            const maintenanceRef = admin.firestore().collection('appConfig').doc('maintenance');
            
            await maintenanceRef.set({
                isEnabled: Boolean(isEnabled),
                message: message || 'We are currently performing maintenance. Please check back later.',
                updatedBy: adminEmail,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            res.json({
                success: true,
                message: `Maintenance mode ${isEnabled ? 'enabled' : 'disabled'} successfully`
            });
        } catch (error) {
            console.error('[SETTINGS] Error updating maintenance mode:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update maintenance mode'
            });
        }
    }

    /**
     * Get Inspire Wallet app settings
     */
    async getAppSettings(req, res) {
        try {
            const appSettingsRef = admin.firestore().collection('appSettings').doc('QmHQ2bo3C7hupza7S1EA');
            const appSettingsDoc = await appSettingsRef.get();

            if (appSettingsDoc.exists) {
                res.json({
                    success: true,
                    data: appSettingsDoc.data()
                });
            } else {
                // Return default settings
                const defaultSettings = {
                    about: false,
                    agentdashboard: false,
                    agentrequest: false,
                    bdo: false,
                    buycards: false,
                    crypto: false,
                    depositcrypto: false,
                    helpcenter: false,
                    inspirecards: false,
                    inspiresecuregrowth: false,
                    inspireauto: false,
                    maya: false,
                    passcode: false,
                    privacy: false,
                    specialcampaign: false,
                    stockholder: false,
                    termsandcondition: false,
                    transfer: false,
                    travel: false
                };
                res.json({
                    success: true,
                    data: defaultSettings
                });
            }
        } catch (error) {
            console.error('[SETTINGS] Error fetching app settings:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch app settings'
            });
        }
    }

    /**
     * Update Inspire Wallet app settings
     */
    async updateAppSettings(req, res) {
        try {
            const updates = req.body;
            const adminEmail = req.user?.email || 'unknown';

            const appSettingsRef = admin.firestore().collection('appSettings').doc('QmHQ2bo3C7hupza7S1EA');
            
            await appSettingsRef.set({
                ...updates,
                updatedBy: adminEmail,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            res.json({
                success: true,
                message: 'App settings updated successfully'
            });
        } catch (error) {
            console.error('[SETTINGS] Error updating app settings:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update app settings'
            });
        }
    }

    /**
     * Get latest event
     */
    async getLatestEvent(req, res) {
        try {
            const eventsRef = admin.firestore().collection('events');
            const snapshot = await eventsRef.orderBy('postedAt', 'desc').limit(1).get();

            if (snapshot.empty) {
                res.json({
                    success: true,
                    data: null
                });
            } else {
                const doc = snapshot.docs[0];
                res.json({
                    success: true,
                    data: {
                        id: doc.id,
                        ...doc.data(),
                        postedAt: doc.data().postedAt?.toDate?.()?.toISOString() || null
                    }
                });
            }
        } catch (error) {
            console.error('[SETTINGS] Error fetching latest event:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch latest event'
            });
        }
    }

    /**
     * Post a new event
     */
    async postEvent(req, res) {
        try {
            const { title, description, date, time, location, imageUrl } = req.body;
            const adminEmail = req.user?.email || 'unknown';

            if (!title || !description) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: title and description'
                });
            }

            // Delete previous event if exists
            const eventsRef = admin.firestore().collection('events');
            const snapshot = await eventsRef.orderBy('postedAt', 'desc').limit(1).get();
            
            if (!snapshot.empty) {
                await snapshot.docs[0].ref.delete();
            }

            // Create new event
            const eventData = {
                title: title.trim(),
                description: description.trim(),
                date: date || new Date().toISOString(),
                time: time || '',
                location: location?.trim() || '',
                imageUrl: imageUrl || '',
                postedBy: adminEmail,
                postedAt: admin.firestore.FieldValue.serverTimestamp(),
                status: false
            };

            const docRef = await eventsRef.add(eventData);

            res.json({
                success: true,
                message: 'Event posted successfully',
                data: {
                    id: docRef.id,
                    ...eventData
                }
            });
        } catch (error) {
            console.error('[SETTINGS] Error posting event:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to post event'
            });
        }
    }

    /**
     * Update event status
     */
    async updateEventStatus(req, res) {
        try {
            const { eventId } = req.params;
            const { status } = req.body;

            if (typeof status !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'Status must be a boolean value'
                });
            }

            const eventRef = admin.firestore().collection('events').doc(eventId);
            const eventDoc = await eventRef.get();

            if (!eventDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'Event not found'
                });
            }

            await eventRef.update({
                status,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            res.json({
                success: true,
                message: 'Event status updated successfully'
            });
        } catch (error) {
            console.error('[SETTINGS] Error updating event status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update event status'
            });
        }
    }

    /**
     * Send push notification to all users
     */
    async sendPushNotification(req, res) {
        try {
            const { title, message } = req.body;
            const adminEmail = req.user?.email || 'unknown';
            const adminUid = req.user?.uid || 'unknown';

            if (!title || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'Title and message are required'
                });
            }

            // Get all users
            const usersSnapshot = await admin.firestore().collection('users').get();
            const users = [];
            
            usersSnapshot.forEach((doc) => {
                const userData = doc.data();
                users.push({
                    id: doc.id,
                    firstName: userData.firstName || '',
                    lastName: userData.lastName || '',
                    fullName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim()
                });
            });

            if (users.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No users found to send notifications to'
                });
            }

            let successfulSends = 0;
            let failedSends = 0;

            // Send notification to each user via NativeNotify API
            for (const userData of users) {
                try {
                    const response = await fetch('https://app.nativenotify.com/api/indie/notification', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            subID: userData.id,
                            appId: 28259,
                            appToken: "QAg2EVLUAIEiCtThmFoSv2",
                            title: title.trim(),
                            message: message.trim(),
                        }),
                    });

                    if (response.ok) {
                        successfulSends++;
                        console.log(`✅ Push notification sent to ${userData.fullName} (${userData.id})`);
                    } else {
                        failedSends++;
                        console.error(`❌ Failed to send notification to ${userData.fullName}`);
                    }
                } catch (apiError) {
                    failedSends++;
                    console.error(`❌ Error sending notification to user ${userData.fullName}:`, apiError);
                }
            }

            // Log the notification to Firestore
            if (successfulSends > 0) {
                const notificationData = {
                    title: title.trim(),
                    message: message.trim(),
                    sentToCount: successfulSends,
                    totalUsers: users.length,
                    failedCount: failedSends,
                    sentBy: {
                        uid: adminUid,
                        email: adminEmail,
                    },
                    sentAt: admin.firestore.FieldValue.serverTimestamp(),
                    type: "push_notification_all_users",
                    method: "backend_api"
                };

                const notificationRef = await admin.firestore().collection('adminNotifications').add(notificationData);
                
                await admin.firestore().collection('notifications').add({
                    ...notificationData,
                    notificationId: notificationRef.id,
                    status: "sent",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            res.json({
                success: true,
                message: `Push notification sent successfully to ${successfulSends} user(s)!${failedSends > 0 ? ` (${failedSends} failed)` : ''}`,
                data: {
                    successfulSends,
                    failedSends,
                    totalUsers: users.length
                }
            });
        } catch (error) {
            console.error('[SETTINGS] Error sending push notifications:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to send push notifications'
            });
        }
    }
}

module.exports = new SettingsController();
