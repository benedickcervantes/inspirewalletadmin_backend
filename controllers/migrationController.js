const migrationService = require('../services/migrationService');

class MigrationController {
    constructor() {
        this.checkMigrationStatus = this.checkMigrationStatus.bind(this);
        this.setupPassword = this.setupPassword.bind(this);
        this.migrateUser = this.migrateUser.bind(this);
    }

    /**
     * Check if user needs migration
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async checkMigrationStatus(req, res) {
        try {
            const { firebaseToken } = req.body;

            if (!firebaseToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Firebase token is required'
                });
            }

            const status = await migrationService.checkMigrationStatus(firebaseToken);

            res.json({
                success: true,
                data: status
            });
        } catch (error) {
            console.error('Controller error checking migration status:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to check migration status'
            });
        }
    }

    /**
     * Setup password for user migration
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async setupPassword(req, res) {
        try {
            const { firebaseToken, password, confirmPassword } = req.body;

            if (!firebaseToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Firebase token is required'
                });
            }

            if (!password) {
                return res.status(400).json({
                    success: false,
                    error: 'Password is required'
                });
            }

            const minPasswordLength = Number.parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10);
            if (password.length < minPasswordLength) {
                return res.status(400).json({
                    success: false,
                    error: `Password must be at least ${minPasswordLength} characters long`
                });
            }

            if (confirmPassword && password !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Passwords do not match'
                });
            }

            // Migrate user with password
            const result = await migrationService.migrateUser(firebaseToken, password);

            res.status(201).json({
                success: true,
                message: 'Password set successfully. User migrated.',
                data: result
            });
        } catch (error) {
            console.error('Controller error setting up password:', error);
            
            if (error.message.includes('already migrated')) {
                return res.status(409).json({
                    success: false,
                    error: error.message
                });
            }

            if (error.message.includes('Invalid Firebase token')) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid Firebase token'
                });
            }

            if (error.message.includes('No matching account')) {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }

            if (error.message.includes('does not match')) {
                return res.status(403).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Failed to setup password'
            });
        }
    }

    /**
     * Migrate user (alias for setupPassword)
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async migrateUser(req, res) {
        // Same as setupPassword
        return this.setupPassword(req, res);
    }
}

module.exports = new MigrationController();

