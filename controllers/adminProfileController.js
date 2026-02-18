const admin = require('firebase-admin');

class AdminProfileController {
    constructor() {
        this.getProfile = this.getProfile.bind(this);
        this.updateUsername = this.updateUsername.bind(this);
        this.updateEmail = this.updateEmail.bind(this);
        this.updatePassword = this.updatePassword.bind(this);
        this.getInvestmentRates = this.getInvestmentRates.bind(this);
        this.updateInvestmentRates = this.updateInvestmentRates.bind(this);
        this.sendPasswordReset = this.sendPasswordReset.bind(this);
    }

    /**
     * Get admin profile
     */
    async getProfile(req, res) {
        try {
            const adminUid = req.user?.adminId || req.user?.userId || req.userId || req.adminId;
            const adminEmail = req.user?.email;

            if (!adminUid) {
                return res.status(400).json({
                    success: false,
                    message: 'Admin ID not found in token'
                });
            }

            // Get from adminUsers collection (Firebase Realtime Database)
            const adminRef = admin.database().ref(`adminUsers/${adminUid}`);
            const snapshot = await adminRef.once('value');
            const adminData = snapshot.val();

            res.json({
                success: true,
                data: {
                    uid: adminUid,
                    email: adminEmail,
                    name: adminData?.name || '',
                    emailAddress: adminData?.emailAddress || adminEmail,
                    createdAt: adminData?.createdAt || null,
                    updatedAt: adminData?.updatedAt || null
                }
            });
        } catch (error) {
            console.error('[ADMIN_PROFILE] Error fetching profile:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch profile'
            });
        }
    }

    /**
     * Update admin username
     */
    async updateUsername(req, res) {
        try {
            const { username } = req.body;
            const adminUid = req.user?.adminId || req.user?.userId || req.userId || req.adminId;

            if (!adminUid) {
                return res.status(400).json({
                    success: false,
                    message: 'Admin ID not found in token'
                });
            }

            if (!username || !username.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Username cannot be empty'
                });
            }

            // Update in adminUsers collection (Firebase Realtime Database)
            const adminRef = admin.database().ref(`adminUsers/${adminUid}`);
            await adminRef.update({
                name: username.trim(),
                updatedAt: admin.database.ServerValue.TIMESTAMP
            });

            res.json({
                success: true,
                message: 'Username updated successfully'
            });
        } catch (error) {
            console.error('[ADMIN_PROFILE] Error updating username:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update username'
            });
        }
    }

    /**
     * Update admin email
     */
    async updateEmail(req, res) {
        try {
            const { email } = req.body;
            const adminUid = req.user?.adminId || req.user?.userId || req.userId || req.adminId;

            if (!adminUid) {
                return res.status(400).json({
                    success: false,
                    message: 'Admin ID not found in token'
                });
            }

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid email address'
                });
            }

            // Update email in Firebase Auth
            await admin.auth().updateUser(adminUid, {
                email: email
            });

            // Update in adminUsers collection (Firebase Realtime Database)
            const adminRef = admin.database().ref(`adminUsers/${adminUid}`);
            await adminRef.update({
                emailAddress: email,
                updatedAt: admin.database.ServerValue.TIMESTAMP
            });

            res.json({
                success: true,
                message: 'Email updated successfully'
            });
        } catch (error) {
            console.error('[ADMIN_PROFILE] Error updating email:', error);
            
            let message = 'Failed to update email';
            if (error.code === 'auth/email-already-exists') {
                message = 'This email is already in use by another account';
            } else if (error.code === 'auth/invalid-email') {
                message = 'Invalid email address';
            }

            res.status(500).json({
                success: false,
                message
            });
        }
    }

    /**
     * Update admin password
     */
    async updatePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;
            const adminUid = req.user?.adminId || req.user?.userId || req.userId || req.adminId;
            const adminEmail = req.user?.email;

            if (!adminUid) {
                return res.status(400).json({
                    success: false,
                    message: 'Admin ID not found in token'
                });
            }

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password and new password are required'
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'New password must be at least 6 characters long'
                });
            }

            // Verify current password using Firebase Auth REST API
            const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
            
            if (!FIREBASE_API_KEY) {
                return res.status(500).json({
                    success: false,
                    message: 'Firebase API key not configured'
                });
            }

            try {
                // Verify the current password by attempting to sign in
                const verifyResponse = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            email: adminEmail,
                            password: currentPassword,
                            returnSecureToken: true,
                        }),
                    }
                );

                if (!verifyResponse.ok) {
                    const errorData = await verifyResponse.json();
                    
                    // Check for invalid password error
                    if (errorData.error?.message?.includes('INVALID_PASSWORD') || 
                        errorData.error?.message?.includes('INVALID_LOGIN_CREDENTIALS')) {
                        return res.status(401).json({
                            success: false,
                            message: 'Current password is incorrect'
                        });
                    }
                    
                    throw new Error(errorData.error?.message || 'Failed to verify password');
                }

                // Current password is correct, now update to new password
                await admin.auth().updateUser(adminUid, {
                    password: newPassword
                });

                // Update timestamp in adminUsers collection
                const adminRef = admin.database().ref(`adminUsers/${adminUid}`);
                await adminRef.update({
                    passwordUpdatedAt: admin.database.ServerValue.TIMESTAMP,
                    updatedAt: admin.database.ServerValue.TIMESTAMP
                });

                res.json({
                    success: true,
                    message: 'Password updated successfully'
                });
            } catch (authError) {
                console.error('[ADMIN_PROFILE] Auth error:', authError);
                
                if (authError.message?.includes('incorrect')) {
                    return res.status(401).json({
                        success: false,
                        message: 'Current password is incorrect'
                    });
                }
                
                throw authError;
            }
        } catch (error) {
            console.error('[ADMIN_PROFILE] Error updating password:', error);
            
            let message = 'Failed to update password';
            if (error.code === 'auth/weak-password') {
                message = 'Password is too weak. Please choose a stronger password';
            } else if (error.message) {
                message = error.message;
            }

            res.status(500).json({
                success: false,
                message
            });
        }
    }

    /**
     * Get investment rates
     */
    async getInvestmentRates(req, res) {
        try {
            const ratesRef = admin.database().ref('investmentRates');
            const snapshot = await ratesRef.once('value');
            const rates = snapshot.val();

            if (!rates) {
                // Return default rates if not set
                return res.json({
                    success: true,
                    rates: {
                        monthlyRate: 0,
                        quarterlyRate: 0,
                        semiAnnualRate: 0,
                        annualRate: 0
                    }
                });
            }

            res.json({
                success: true,
                rates
            });
        } catch (error) {
            console.error('[ADMIN_PROFILE] Error fetching investment rates:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch investment rates'
            });
        }
    }

    /**
     * Update investment rates
     */
    async updateInvestmentRates(req, res) {
        try {
            const { monthlyRate, quarterlyRate, semiAnnualRate, annualRate } = req.body;
            const adminEmail = req.user?.email || 'unknown';

            // Validate rates
            if (
                typeof monthlyRate !== 'number' ||
                typeof quarterlyRate !== 'number' ||
                typeof semiAnnualRate !== 'number' ||
                typeof annualRate !== 'number'
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'All rates must be valid numbers'
                });
            }

            const ratesData = {
                monthlyRate,
                quarterlyRate,
                semiAnnualRate,
                annualRate,
                updatedBy: adminEmail,
                updatedAt: admin.database.ServerValue.TIMESTAMP
            };

            const ratesRef = admin.database().ref('investmentRates');
            await ratesRef.set(ratesData);

            res.json({
                success: true,
                message: 'Investment rates updated successfully'
            });
        } catch (error) {
            console.error('[ADMIN_PROFILE] Error updating investment rates:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update investment rates'
            });
        }
    }
    /**
     * Send password reset link to a user
     */
    async sendPasswordReset(req, res) {
        try {
            const { email } = req.body;

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid email address'
                });
            }

            // Check if user exists first
            try {
                await admin.auth().getUserByEmail(email);
            } catch (error) {
                if (error.code === 'auth/user-not-found') {
                    return res.status(404).json({
                        success: false,
                        message: 'No user found with that email address'
                    });
                }
                throw error;
            }

            // Generate and send password reset email using Firebase Auth
            // This will automatically send an email to the user
            const actionCodeSettings = {
                // URL you want to redirect back to after password reset
                url: process.env.FIREBASE_PASSWORD_RESET_URL || 'https://inspire-wallet.web.app',
                handleCodeInApp: false,
            };

            const resetLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);

            // Firebase doesn't automatically send the email when using Admin SDK
            // We need to send it manually or use the client SDK
            // For now, let's use a simple approach with nodemailer or similar
            
            // Alternative: Use Firebase Auth REST API to trigger the email
            // This is the proper way to send password reset emails
            const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
            
            if (FIREBASE_API_KEY) {
                const response = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            requestType: 'PASSWORD_RESET',
                            email: email,
                        }),
                    }
                );

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error?.message || 'Failed to send reset email');
                }

                res.json({
                    success: true,
                    message: 'Password reset email sent successfully',
                    data: {
                        email
                    }
                });
            } else {
                // Fallback: return the link (not recommended for production)
                res.json({
                    success: true,
                    message: 'Password reset link generated (email sending not configured)',
                    data: {
                        email,
                        resetLink,
                        note: 'Please configure FIREBASE_API_KEY in .env to enable automatic email sending'
                    }
                });
            }
        } catch (error) {
            console.error('[ADMIN_PROFILE] Error sending password reset:', error);
            
            let message = 'Failed to send password reset link';
            if (error.code === 'auth/invalid-email') {
                message = 'Invalid email address';
            } else if (error.message) {
                message = error.message;
            }

            res.status(500).json({
                success: false,
                message
            });
        }
    }
}

module.exports = new AdminProfileController();
